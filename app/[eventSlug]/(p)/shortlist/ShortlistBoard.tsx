"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DATA_READY_LABELS, FIX_TYPES, FIX_TYPE_LABELS, VALUE_LABELS } from "@/lib/copy";
import { computeScore, requiredShortlistCount, type ScoreWeights } from "@/lib/rules";
import { useAutoField, useParticipant, useSaveStatus } from "@/components/participant/ParticipantProvider";
import { AutoSelect, EditingBadge, SegmentedControl } from "@/components/participant/fields";
import { confirmShortlist } from "@/lib/actions/participant";

type Row = {
  id: string;
  title: string;
  data_ready: number | null;
  value: number | null;
  fix_type: string | null;
  builds_foundation: boolean;
  shortlisted: boolean;
  score: number;
};

function ShortlistRow({ r, weights, rank }: { r: Row; weights: ScoreWeights; rank: number }) {
  const op = (field: string) => (value: unknown) => ({ kind: "problem.set", id: r.id, field, value });
  const ready = useAutoField<number | null>(`problem:${r.id}:data_ready`, r.data_ready, op("data_ready"), true);
  const value = useAutoField<number | null>(`problem:${r.id}:value`, r.value, op("value"), true);
  const foundation = useAutoField<boolean>(`problem:${r.id}:builds_foundation`, r.builds_foundation, op("builds_foundation"), true);
  const pick = useAutoField<boolean>(`problem:${r.id}:shortlisted`, r.shortlisted, op("shortlisted"), true);
  const score = computeScore({ data_ready: ready.value, value: value.value, builds_foundation: foundation.value }, weights);
  const max = weights.ready + weights.value + weights.foundation || 100;
  const pickId = `pick-${r.id}`;
  const foundId = `found-${r.id}`;

  return (
    <article className={`card p-4 sm:p-5 ${pick.value ? "border-teal" : ""}`} aria-labelledby={`row-${r.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={`row-${r.id}`} className="max-w-2xl text-lg font-semibold">
          <span className="mr-2 font-mono text-sm text-muted">#{rank}</span>
          {r.title || "Untitled problem"}
        </h2>
        <div className="flex items-center gap-2 rounded-[8px] border border-input px-3 py-2">
          <input
            id={pickId}
            type="checkbox"
            className="h-6 w-6 accent-teal"
            checked={pick.value}
            disabled={pick.locked}
            onChange={(e) => pick.set(e.target.checked)}
            {...pick.focus}
          />
          <label htmlFor={pickId} className="font-semibold text-ink">
            On the shortlist
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SegmentedControl
          label="Data ready"
          labels={DATA_READY_LABELS}
          value={ready.value}
          onChange={ready.set}
          disabled={ready.locked}
          focus={ready.focus}
          badge={<EditingBadge opKey={`problem:${r.id}:data_ready`} />}
        />
        <SegmentedControl
          label="Value to the business"
          labels={VALUE_LABELS}
          value={value.value}
          onChange={value.set}
          disabled={value.locked}
          focus={value.focus}
          badge={<EditingBadge opKey={`problem:${r.id}:value`} />}
        />
        <AutoSelect
          opKey={`problem:${r.id}:fix_type`}
          server={r.fix_type}
          toOp={op("fix_type")}
          label="What kind of fix?"
          options={FIX_TYPES.map((f) => ({ value: f, label: FIX_TYPE_LABELS[f] }))}
        />
        <div className="flex items-start gap-3 pt-7">
          <input
            id={foundId}
            type="checkbox"
            className="mt-0.5 h-6 w-6 shrink-0 accent-teal"
            checked={foundation.value}
            disabled={foundation.locked}
            onChange={(e) => foundation.set(e.target.checked)}
            {...foundation.focus}
          />
          <label htmlFor={foundId}>
            <span className="block font-medium text-ink">Builds a foundation</span>
            <span className="block text-sm text-muted">Fixing this makes the next AI project easier too.</span>
          </label>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">Score</span>
          <span className="font-mono text-ink">
            {score} / {max}
          </span>
        </div>
        <div
          className="mt-1 h-3 overflow-hidden rounded-full bg-line"
          role="meter"
          aria-label="Score"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={score}
        >
          <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${Math.round((score / max) * 100)}%` }} />
        </div>
      </div>
    </article>
  );
}

export function ShortlistBoard({
  rows,
  weights,
  overridden,
  confirmedAt,
  review,
  goldenHref,
  problemsHref,
}: {
  rows: Row[];
  weights: ScoreWeights;
  overridden: boolean;
  confirmedAt: string | null;
  review: { reviewedAt: string; by: string | null } | null;
  goldenHref: string | null;
  problemsHref: string;
}) {
  const { queue, locked } = useParticipant();
  useSaveStatus(); // re-render when local picks change
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);
  const need = requiredShortlistCount(rows.length);
  const picked = rows.filter((r) => {
    const local = queue.pendingValue(`problem:${r.id}:shortlisted`);
    return local ? Boolean(local.value) : r.shortlisted;
  }).length;

  const confirm = () =>
    start(async () => {
      setMessage(null);
      const flushed = await queue.flushNow();
      if (!flushed) {
        setMessage({ text: "We could not save your changes yet. Check your connection and try again.", warn: true });
        return;
      }
      const r = await confirmShortlist();
      setMessage(r.ok ? { text: "Shortlist confirmed.", warn: false } : { text: r.error, warn: true });
    });

  const reset = () => queue.set("shortlist.reset", { kind: "shortlist.reset" }, true);

  if (rows.length === 0) {
    return (
      <p className="notice">
        You have no problems yet. <Link className="link" href={problemsHref}>Add them first</Link>.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="grid gap-4">
        {rows.map((r, i) => (
          <ShortlistRow key={r.id} r={r} weights={weights} rank={i + 1} />
        ))}
      </div>
      <aside className="grid h-fit gap-4 lg:sticky lg:top-4" aria-label="Shortlist status">
        <section className="card p-4">
          <h2 className="text-lg font-semibold">Your shortlist</h2>
          <p className="mt-1">
            We tick the top {need} by score. You can change the pick.
          </p>
          <p className="mt-3 text-2xl font-semibold text-ink" aria-live="polite">
            {picked} of {need} picked
          </p>
          {overridden && !locked && (
            <button type="button" className="link mt-2 text-sm" onClick={reset}>
              Go back to the automatic pick
            </button>
          )}
          {!locked && (
            <button type="button" className="btn mt-4 w-full" onClick={confirm} disabled={pending}>
              {pending ? "Confirming" : confirmedAt ? "Confirm again" : "Confirm shortlist"}
            </button>
          )}
          <div aria-live="polite">
            {message && <p className={`mt-3 text-sm ${message.warn ? "text-warning" : "text-success"}`}>{message.text}</p>}
            {!message && confirmedAt && <p className="mt-3 text-sm text-success">Shortlist confirmed.</p>}
          </div>
          {confirmedAt && goldenHref && (
            <Link className="btn btn-secondary mt-3 w-full" href={goldenHref}>
              Go to golden use case
            </Link>
          )}
        </section>
        <section className="card p-4">
          <h2 className="text-lg font-semibold">Expert check</h2>
          {review ? (
            <p className="mt-1 text-success">
              Reviewed by {review.by ?? "an ARM Hub expert"}.
            </p>
          ) : (
            <p className="mt-1 text-muted">An ARM Hub expert will look over your shortlist during the session.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
