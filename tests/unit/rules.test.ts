import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoShortlistIds,
  canOpenStage,
  computeScore,
  eligibilityFlags,
  goldenMissing,
  groupSmallOptions,
  isEditingLocked,
  isStuck,
  nextStage,
  normaliseSizeBand,
  requiredShortlistCount,
  timerRemainingSeconds,
  titleError,
} from "../../lib/rules";

test("score uses the spec formula and default weights 40/40/20", () => {
  assert.equal(computeScore({ data_ready: 5, value: 5, builds_foundation: true }), 100);
  assert.equal(computeScore({ data_ready: 3, value: 4, builds_foundation: false }), 56); // 24 + 32
  assert.equal(computeScore({ data_ready: 1, value: 2, builds_foundation: true }), 44); // 8 + 16 + 20
  assert.equal(computeScore({ data_ready: null, value: null, builds_foundation: false }), 0);
  assert.equal(computeScore({ data_ready: 3, value: 3, builds_foundation: false }, { ready: 50, value: 30, foundation: 20 }), 48);
  assert.equal(computeScore({ data_ready: 1, value: 1, builds_foundation: false }, { ready: 33, value: 33, foundation: 34 }), 13); // 6.6 + 6.6 rounds to 13
});

test("auto shortlist picks the top 3 by score, ties by position", () => {
  const ps = [
    { id: "a", score: 50, position: 1 },
    { id: "b", score: 80, position: 2 },
    { id: "c", score: 50, position: 3 },
    { id: "d", score: 90, position: 4 },
  ];
  assert.deepEqual([...autoShortlistIds(ps)].sort(), ["a", "b", "d"]);
  assert.deepEqual([...autoShortlistIds(ps.slice(0, 2))].sort(), ["a", "b"]);
});

test("shortlist must be exactly 3, or all when fewer", () => {
  assert.equal(requiredShortlistCount(4), 3);
  assert.equal(requiredShortlistCount(3), 3);
  assert.equal(requiredShortlistCount(2), 2);
  assert.equal(requiredShortlistCount(1), 1);
});

test("problem titles must be 10 to 150 characters", () => {
  assert.ok(titleError("too short"));
  assert.equal(titleError("exactly 10"), null);
  assert.equal(titleError("x".repeat(150)), null);
  assert.ok(titleError("x".repeat(151)));
  assert.ok(titleError("   padded   ")); // trimmed to 6
});

test("golden draft required fields", () => {
  assert.deepEqual(goldenMissing(null), ["first_project", "metric", "data_location", "owner"]);
  assert.deepEqual(goldenMissing({ first_project: "x", metric: "y", data_location: " ", owner: "z" }), ["data_location"]);
});

test("stage gating allows the current and earlier stages only", () => {
  assert.ok(canOpenStage("shortlist", "problems"));
  assert.ok(canOpenStage("shortlist", "shortlist"));
  assert.ok(!canOpenStage("shortlist", "golden"));
  assert.ok(!canOpenStage("arrival", "poll"));
  assert.equal(nextStage("golden"), "next_steps");
  assert.equal(nextStage("done"), "done");
});

test("editing locks on close time, closed status or company lock", () => {
  const now = new Date("2026-10-21T05:00:00Z");
  assert.ok(!isEditingLocked({ status: "live", access_closes_at: "2026-10-21T08:00:00Z" }, { is_locked: false }, now));
  assert.ok(isEditingLocked({ status: "live", access_closes_at: "2026-10-21T04:00:00Z" }, null, now));
  assert.ok(isEditingLocked({ status: "closed", access_closes_at: null }, null, now));
  assert.ok(isEditingLocked({ status: "live", access_closes_at: null }, { is_locked: true }, now));
});

test("eligibility flags", () => {
  assert.deepEqual(eligibilityFlags("200+"), ["over_200"]);
  assert.deepEqual(eligibilityFlags(null), ["size_missing"]);
  assert.deepEqual(eligibilityFlags("50-199"), []);
});

test("stuck after the threshold while a stage is open", () => {
  const now = new Date("2026-10-21T05:00:00Z");
  assert.ok(isStuck("2026-10-21T04:50:00Z", "problems", 8, now));
  assert.ok(!isStuck("2026-10-21T04:55:00Z", "problems", 8, now));
  assert.ok(!isStuck("2026-10-21T04:00:00Z", "arrival", 8, now));
});

test("timer is worked out from the end time", () => {
  const now = Date.parse("2026-10-21T05:00:00Z");
  assert.deepEqual(timerRemainingSeconds({ timer_ends_at: "2026-10-21T05:02:30Z", timer_paused_remaining_s: null }, now), { seconds: 150, running: true });
  assert.deepEqual(timerRemainingSeconds({ timer_ends_at: null, timer_paused_remaining_s: 42 }, now), { seconds: 42, running: false });
  assert.equal(timerRemainingSeconds({ timer_ends_at: null, timer_paused_remaining_s: null }, now), null);
});

test("small poll options group into Other", () => {
  const r = groupSmallOptions([
    { option: "A", count: 10 },
    { option: "B", count: 8 },
    { option: "C", count: 1 },
    { option: "D", count: 1 },
  ]);
  assert.deepEqual(r, [{ option: "A", count: 10 }, { option: "B", count: 8 }, { option: "Other", count: 2 }]);
});

test("size bands from messy CSV values", () => {
  assert.equal(normaliseSizeBand("1-19"), "1-19");
  assert.equal(normaliseSizeBand("20 to 49"), "20-49");
  assert.equal(normaliseSizeBand("120"), "50-199");
  assert.equal(normaliseSizeBand("200+"), "200+");
  assert.equal(normaliseSizeBand("500 or more"), "200+");
  assert.equal(normaliseSizeBand(""), null);
  assert.equal(normaliseSizeBand("unknown"), null);
});
