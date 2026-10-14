"use client";

import Link from "next/link";
import { APPROVAL_LEVELS, GOLDEN_CHECKS } from "@/lib/copy";
import { GOLDEN_FIELD_LABELS } from "@/lib/rules";
import { useAutoField, useParticipant } from "@/components/participant/ParticipantProvider";
import { AutoSelect, TextControl, EditingBadge } from "@/components/participant/fields";
import { AiSuggestion } from "@/components/participant/AiSuggestion";

type Problem = { id: string; title: string };
type Draft = {
  first_project: string | null;
  metric: string | null;
  baseline: string | null;
  target: string | null;
  data_location: string | null;
  sample_access: string | null;
  approval_level: string | null;
  owner: string | null;
  check_mvp: boolean;
  check_collab: boolean;
  check_metric: boolean;
  check_data: boolean;
};

const EMPTY: Draft = {
  first_project: null,
  metric: null,
  baseline: null,
  target: null,
  data_location: null,
  sample_access: null,
  approval_level: null,
  owner: null,
  check_mvp: false,
  check_collab: false,
  check_metric: false,
  check_data: false,
};

function useText(problemId: string, field: keyof Draft, server: string | null) {
  return useAutoField<string>(`golden:${problemId}:${field}`, server ?? "", (v) => ({
    kind: "golden.set",
    id: problemId,
    field,
    value: v,
  }));
}

function DraftForm({ problem, draft, aiEnabled }: { problem: Problem; draft: Draft; aiEnabled: boolean }) {
  const { queue } = useParticipant();
  const firstProject = useText(problem.id, "first_project", draft.first_project);
  const metric = useText(problem.id, "metric", draft.metric);
  const baseline = useText(problem.id, "baseline", draft.baseline);
  const target = useText(problem.id, "target", draft.target);
  const dataLocation = useText(problem.id, "data_location", draft.data_location);
  const sampleAccess = useText(problem.id, "sample_access", draft.sample_access);
  const owner = useText(problem.id, "owner", draft.owner);
  const checks = {
    check_mvp: useAutoField<boolean>(`golden:${problem.id}:check_mvp`, draft.check_mvp, (v) => ({ kind: "golden.set", id: problem.id, field: "check_mvp", value: v }), true),
    check_collab: useAutoField<boolean>(`golden:${problem.id}:check_collab`, draft.check_collab, (v) => ({ kind: "golden.set", id: problem.id, field: "check_collab", value: v }), true),
    check_metric: useAutoField<boolean>(`golden:${problem.id}:check_metric`, draft.check_metric, (v) => ({ kind: "golden.set", id: problem.id, field: "check_metric", value: v }), true),
    check_data: useAutoField<boolean>(`golden:${problem.id}:check_data`, draft.check_data, (v) => ({ kind: "golden.set", id: problem.id, field: "check_data", value: v }), true),
  };

  const required = [
    { key: "first_project", done: Boolean(firstProject.value.trim()) },
    { key: "metric", done: Boolean(metric.value.trim()) },
    { key: "data_location", done: Boolean(dataLocation.value.trim()) },
    { key: "owner", done: Boolean(owner.value.trim()) },
  ];
  const checksDone = Object.values(checks).filter((c) => c.value).length;
  const missing = required.filter((r) => !r.done).map((r) => GOLDEN_FIELD_LABELS[r.key]);
  // Readiness: the problem plus 4 required fields plus 4 checks.
  const total = 1 + required.length + 4;
  const score = 1 + required.filter((r) => r.done).length + checksDone;
  const pct = Math.round((score / total) * 100);

  const t = (f: ReturnType<typeof useText>) => ({ value: f.value, onChange: f.set, focus: f.focus, disabled: f.locked });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="grid gap-5">
        <TextControl {...t(firstProject)} opKey={`golden:${problem.id}:first_project`} multiline maxLength={1000} required
          label="What is the first small project?" hint="Something you could build and test in 8 to 12 weeks." />
        <section className="card grid gap-4 p-4" aria-labelledby={`measure-${problem.id}`}>
          <h2 id={`measure-${problem.id}`} className="text-lg font-semibold">How will you know it worked?</h2>
          <TextControl {...t(metric)} opKey={`golden:${problem.id}:metric`} maxLength={500} required
            label="Measure of success" placeholder="For example, hours spent on batch records each week" />
          <div className="grid gap-4 md:grid-cols-2">
            <TextControl {...t(baseline)} opKey={`golden:${problem.id}:baseline`} maxLength={300}
              label="Where you are today" hint="Optional. Leave it blank if you do not know yet." />
            <TextControl {...t(target)} opKey={`golden:${problem.id}:target`} maxLength={300}
              label="Where you want to be" hint="Optional." />
          </div>
          {aiEnabled && !firstProject.locked && (
            <AiSuggestion
              kind="measure"
              problemId={problem.id}
              buttonLabel="Suggest a measure with AI"
              onAccept={(s) => {
                for (const field of ["metric", "baseline", "target"] as const) {
                  if (s[field]) queue.set(`golden:${problem.id}:${field}`, { kind: "golden.set", id: problem.id, field, value: s[field].slice(0, field === "metric" ? 500 : 300) }, true);
                }
              }}
            />
          )}
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <TextControl {...t(dataLocation)} opKey={`golden:${problem.id}:data_location`} maxLength={500} required
            label="Where does the data live?" placeholder="For example, Excel files on SharePoint" />
          <TextControl {...t(sampleAccess)} opKey={`golden:${problem.id}:sample_access`} maxLength={500}
            label="Could you share a sample of the data?" placeholder="For example, yes, after removing patient details" />
          <AutoSelect opKey={`golden:${problem.id}:approval_level`} server={draft.approval_level}
            toOp={(v) => ({ kind: "golden.set", id: problem.id, field: "approval_level", value: v })}
            label="Who needs to approve it?" options={APPROVAL_LEVELS.map((a) => ({ value: a, label: a }))} />
          <TextControl {...t(owner)} opKey={`golden:${problem.id}:owner`} maxLength={200} required
            label="Who will own this project?" placeholder="Name and role" />
        </div>
      </div>

      <aside className="grid h-fit gap-4 lg:sticky lg:top-4" aria-label="Readiness">
        <section className="card p-4">
          <h2 className="text-lg font-semibold">Readiness</h2>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span>How complete your draft is</span>
            <span className="font-mono text-ink">{pct}%</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-line" role="meter" aria-label="Readiness"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${pct}%` }} />
          </div>
          <fieldset className="mt-4">
            <legend className="font-semibold text-ink">Four checks</legend>
            <div className="mt-2 grid gap-3">
              {GOLDEN_CHECKS.map((c) => {
                const f = checks[c.key];
                const id = `${c.key}-${problem.id}`;
                return (
                  <div key={c.key} className="flex items-start gap-3">
                    <input id={id} type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-teal" checked={f.value}
                      disabled={f.locked} onChange={(e) => f.set(e.target.checked)} {...f.focus} />
                    <label htmlFor={id} className="text-sm">
                      {c.label}
                      <EditingBadge opKey={`golden:${problem.id}:${c.key}`} />
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-4 text-sm" aria-live="polite">
            {missing.length === 0 ? (
              <p className="text-success">All required fields are filled in.</p>
            ) : (
              <p>Still to fill in: {missing.join(", ")}.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

export function GoldenBoard({
  problems,
  drafts,
  selectedId,
  aiEnabled,
  nextHref,
  shortlistHref,
}: {
  problems: Problem[];
  drafts: Record<string, Draft>;
  selectedId: string | null;
  aiEnabled: boolean;
  nextHref: string | null;
  shortlistHref: string;
}) {
  const pick = useAutoField<string | null>("company:golden_problem_id", selectedId, (v) => ({
    kind: "company.set",
    field: "golden_problem_id",
    value: v,
  }), true);
  const selected = problems.find((p) => p.id === pick.value) ?? null;

  if (problems.length === 0) {
    return (
      <p className="notice">
        Your shortlist is empty. <Link className="link" href={shortlistHref}>Pick your shortlist first</Link>.
      </p>
    );
  }

  return (
    <div className="grid gap-6">
      <fieldset>
        <legend className="field-label text-lg">
          Which shortlisted problem will you take forward?
          <EditingBadge opKey="company:golden_problem_id" />
        </legend>
        <p className="field-hint mb-3 mt-0">Each problem keeps its own draft, so you can switch without losing work.</p>
        <div className="grid gap-2 md:grid-cols-3">
          {problems.map((p) => {
            const checked = pick.value === p.id;
            return (
              <label key={p.id}
                className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[10px] border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal ${
                  checked ? "border-teal bg-tint" : "border-line bg-white hover:border-input"}`}>
                <input type="radio" name="golden-problem" value={p.id} checked={checked} disabled={pick.locked}
                  onChange={() => pick.set(p.id)} className="mt-1 h-5 w-5 shrink-0 accent-teal" {...pick.focus} />
                <span className="font-medium text-ink">{p.title}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {selected ? (
        <DraftForm key={selected.id} problem={selected} draft={drafts[selected.id] ?? EMPTY} aiEnabled={aiEnabled} />
      ) : (
        <p className="notice">Pick a problem above to start your draft.</p>
      )}

      {selected && nextHref && (
        <p>
          <Link className="btn" href={nextHref}>Continue to next steps</Link>
        </p>
      )}
    </div>
  );
}
