import { DATA_READY_LABELS, FIX_TYPE_LABELS, NEXT_CHOICE_LABELS, PROBLEM_TYPE_INFO, VALUE_LABELS, type FixType, type NextChoice, type ProblemType } from "@/lib/copy";
import type { GoldenDraftRow, NextStepsRow, ProblemRow } from "@/lib/types";

// Read-only views of a company's answers. Used on P8 and in the team console.

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-ink">{value || <span className="text-muted">Not given</span>}</dd>
    </div>
  );
}

export function ProblemSummary({ p, index }: { p: ProblemRow; index: number }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">
          Problem {index + 1}: {p.title || "Untitled"}
        </h3>
        <span className="flex gap-2">
          {p.shortlisted && <span className="pill pill-teal">Shortlisted</span>}
          <span className="pill font-mono">Score {p.score}</span>
        </span>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Item label="What happens today" value={p.today_state} />
        <Item label="What good would look like" value={p.future_state} />
        <Item label="Type" value={p.type ? PROBLEM_TYPE_INFO[p.type as ProblemType]?.label : null} />
        <Item label="Who does this work" value={p.affected_role} />
        <Item label="How often" value={p.frequency} />
        <Item label="Fix type" value={p.fix_type ? FIX_TYPE_LABELS[p.fix_type as FixType] : null} />
        <Item label="Data ready" value={p.data_ready ? `${p.data_ready}: ${DATA_READY_LABELS[p.data_ready]}` : null} />
        <Item label="Value" value={p.value ? `${p.value}: ${VALUE_LABELS[p.value]}` : null} />
        <Item label="Builds a foundation" value={p.builds_foundation ? "Yes" : "No"} />
      </dl>
    </div>
  );
}

export function GoldenSummary({ draft, problemTitle }: { draft: GoldenDraftRow | null; problemTitle: string | null }) {
  if (!draft && !problemTitle) return <p className="text-muted">No golden use case yet.</p>;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Item label="Problem" value={problemTitle} />
      </div>
      <div className="sm:col-span-2">
        <Item label="First project" value={draft?.first_project} />
      </div>
      <Item label="Measure of success" value={draft?.metric} />
      <Item label="Where you are today" value={draft?.baseline} />
      <Item label="Where you want to be" value={draft?.target} />
      <Item label="Where the data lives" value={draft?.data_location} />
      <Item label="Sample of the data" value={draft?.sample_access} />
      <Item label="Who approves it" value={draft?.approval_level} />
      <Item label="Owner" value={draft?.owner} />
      <Item
        label="Checks"
        value={
          draft
            ? `${[draft.check_mvp, draft.check_collab, draft.check_metric, draft.check_data].filter(Boolean).length} of 4 ticked`
            : null
        }
      />
    </dl>
  );
}

export function NextSummary({ next }: { next: NextStepsRow | null }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Item label="Next step" value={next?.choice ? NEXT_CHOICE_LABELS[next.choice as NextChoice].label : null} />
      <Item label="When you could start" value={next?.start_timing} />
      <Item label="Anyone else to include" value={next?.extra_contact} />
    </dl>
  );
}
