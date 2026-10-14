// Business rules from section 6 of the spec, as small pure functions.
// They have no database access so they can be unit tested and used in the browser.

import { STAGES, type Stage } from "./copy";

export type ScoreWeights = { ready: number; value: number; foundation: number };
export const DEFAULT_WEIGHTS: ScoreWeights = { ready: 40, value: 40, foundation: 20 };

export function normaliseWeights(raw: unknown): ScoreWeights {
  const w = (raw ?? {}) as Partial<ScoreWeights>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    ready: num(w.ready, DEFAULT_WEIGHTS.ready),
    value: num(w.value, DEFAULT_WEIGHTS.value),
    foundation: num(w.foundation, DEFAULT_WEIGHTS.foundation),
  };
}

// round(data_ready/5 * w.ready + value/5 * w.value + (builds_foundation ? w.foundation : 0))
// A rating that has not been set yet counts as 0.
export function computeScore(
  p: { data_ready: number | null; value: number | null; builds_foundation: boolean },
  w: ScoreWeights = DEFAULT_WEIGHTS,
): number {
  const ready = p.data_ready ?? 0;
  const value = p.value ?? 0;
  return Math.round((ready / 5) * w.ready + (value / 5) * w.value + (p.builds_foundation ? w.foundation : 0));
}

export type RankedProblem = { id: string; score: number; position: number };

// Problems sorted best first. Ties keep the order the problems were written in.
export function rankProblems<T extends RankedProblem>(problems: T[]): T[] {
  return [...problems].sort((a, b) => b.score - a.score || a.position - b.position);
}

// The automatic shortlist: the top 3 by score.
export function autoShortlistIds(problems: RankedProblem[]): Set<string> {
  return new Set(rankProblems(problems).slice(0, 3).map((p) => p.id));
}

// The participant must pick exactly 3, or every problem if there are fewer than 3.
export function requiredShortlistCount(problemCount: number): number {
  return Math.min(3, problemCount);
}

export const PROBLEM_LIMITS = { min: 1, max: 4, titleMin: 10, titleMax: 150 } as const;

export function titleError(title: string | null | undefined): string | null {
  const t = (title ?? "").trim();
  if (t.length < PROBLEM_LIMITS.titleMin) return `Write at least ${PROBLEM_LIMITS.titleMin} characters.`;
  if (t.length > PROBLEM_LIMITS.titleMax) return `Keep it to ${PROBLEM_LIMITS.titleMax} characters or fewer.`;
  return null;
}

export const GOLDEN_REQUIRED = ["first_project", "metric", "data_location", "owner"] as const;
export const GOLDEN_FIELD_LABELS: Record<string, string> = {
  problem: "The problem",
  first_project: "First project",
  metric: "How you will measure it",
  data_location: "Where the data lives",
  owner: "Who owns it",
};

// Required fields still empty on a golden draft. The problem itself is checked separately.
export function goldenMissing(draft: Partial<Record<(typeof GOLDEN_REQUIRED)[number], string | null>> | null) {
  return GOLDEN_REQUIRED.filter((k) => !(draft?.[k] ?? "").toString().trim());
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

// Participants can open the current stage and any earlier one.
export function canOpenStage(current: Stage, target: Stage): boolean {
  return stageIndex(target) <= stageIndex(current);
}

export function nextStage(current: Stage): Stage {
  return STAGES[Math.min(stageIndex(current) + 1, STAGES.length - 1)];
}

// Editing locks when access closes, when the event is closed, or when admin locks the company.
export function isEditingLocked(
  event: { status: string; access_closes_at: Date | string | null },
  company?: { is_locked: boolean } | null,
  now: Date = new Date(),
): boolean {
  if (event.status === "closed") return true;
  if (event.access_closes_at && new Date(event.access_closes_at).getTime() <= now.getTime()) return true;
  return Boolean(company?.is_locked);
}

// Flags shown to staff when a company may sit outside AI Adopt SME eligibility.
export function eligibilityFlags(sizeBand: string | null | undefined): string[] {
  if (!sizeBand) return ["size_missing"];
  if (sizeBand === "200+") return ["over_200"];
  return [];
}

export function isStuck(
  lastActivity: Date | string | null,
  stage: Stage,
  thresholdMin: number,
  now: Date = new Date(),
): boolean {
  if (stage === "arrival" || stage === "done") return false;
  if (!lastActivity) return true;
  return now.getTime() - new Date(lastActivity).getTime() > thresholdMin * 60_000;
}

// Timer helpers. The database stores when the timer ends, never a ticking value.
export function timerRemainingSeconds(
  event: { timer_ends_at: Date | string | null; timer_paused_remaining_s: number | null },
  nowMs: number,
): { seconds: number; running: boolean } | null {
  if (event.timer_ends_at) {
    return { seconds: Math.max(0, Math.round((new Date(event.timer_ends_at).getTime() - nowMs) / 1000)), running: true };
  }
  if (event.timer_paused_remaining_s != null) return { seconds: event.timer_paused_remaining_s, running: false };
  return null;
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Poll privacy: nothing is shown until 5 people have answered.
export const POLL_MIN_RESPONSES = 5;

// Groups options with fewer than `minShare` of responses into "Other".
export function groupSmallOptions(counts: { option: string; count: number }[], minShare = 0.1) {
  const total = counts.reduce((s, c) => s + c.count, 0);
  if (total === 0) return counts;
  const keep = counts.filter((c) => c.count / total >= minShare);
  const other = counts.filter((c) => c.count / total < minShare);
  if (other.length < 2) return counts;
  return [...keep, { option: "Other", count: other.reduce((s, c) => s + c.count, 0) }];
}

export function normaliseSizeBand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toString().trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (/200|\+|or more|500|1000/.test(s)) {
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && n < 200) return bandForNumber(n);
    return "200+";
  }
  const range = s.match(/(\d+)\s*(?:-|to|–)\s*(\d+)/);
  if (range) return bandForNumber(parseInt(range[2], 10));
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? bandForNumber(n) : null;
}

function bandForNumber(n: number): string {
  if (n < 20) return "1-19";
  if (n < 50) return "20-49";
  if (n < 200) return "50-199";
  return "200+";
}
