import "server-only";
import type { Queryable } from "./db";
import { FIX_TYPE_LABELS, NEXT_CHOICE_LABELS, PROBLEM_TYPE_INFO, type FixType, type NextChoice, type ProblemType } from "./copy";
import { formatDate } from "./format";
import type { FinalPlanRow, GoldenDraftRow, NextStepsRow, ProblemRow } from "./types";
import type { PlanPdfData } from "./pdf/PlanDoc";

// Final plan versions.
// * The newest version is the one staff edit, until it has been sent.
// * Editing after a send creates a new version, so what each person received is kept.

export async function latestPlan(q: Queryable, companyId: string): Promise<FinalPlanRow | null> {
  return q.one<FinalPlanRow>("select * from final_plans where company_id = $1 order by version desc limit 1", [companyId]);
}

export async function latestSentPlan(q: Queryable, companyId: string): Promise<FinalPlanRow | null> {
  return q.one<FinalPlanRow>(
    "select * from final_plans where company_id = $1 and status in ('sent','opened') order by version desc limit 1",
    [companyId],
  );
}

// Creates version 1 from the company's golden draft the first time staff open it.
export async function ensurePlan(q: Queryable, companyId: string): Promise<FinalPlanRow> {
  const existing = await latestPlan(q, companyId);
  if (existing) return existing;
  const company = await q.one<{ golden_problem_id: string | null }>("select golden_problem_id from companies where id = $1", [companyId]);
  const problem = company?.golden_problem_id
    ? await q.one<ProblemRow>("select * from problems where id = $1", [company.golden_problem_id])
    : null;
  const draft = problem
    ? await q.one<GoldenDraftRow>("select * from golden_drafts where company_id = $1 and problem_id = $2", [companyId, problem.id])
    : null;
  const row = await q.one<FinalPlanRow>(
    `insert into final_plans (company_id, version, status, title, first_project, metric, baseline, target)
     values ($1, 1, 'draft_received', $2, $3, $4, $5, $6)
     on conflict (company_id, version) do update set company_id = excluded.company_id
     returning *`,
    [companyId, problem?.title ?? null, draft?.first_project ?? null, draft?.metric ?? null, draft?.baseline ?? null, draft?.target ?? null],
  );
  return row!;
}

// The participant's own answers, as text for the AI drafting helper.
// Facilitator notes are deliberately left out: they never go into the final plan.
export async function participantAnswersText(q: Queryable, companyId: string): Promise<string> {
  const c = await q.one<{ name: string; sector: string | null; size_band: string | null; state: string | null; golden_problem_id: string | null }>(
    "select name, sector, size_band, state, golden_problem_id from companies where id = $1",
    [companyId],
  );
  const problems = await q.query<ProblemRow>(
    "select * from problems where company_id = $1 and deleted_at is null order by score desc, position",
    [companyId],
  );
  const drafts = await q.query<GoldenDraftRow>("select * from golden_drafts where company_id = $1", [companyId]);
  const next = await q.one<NextStepsRow>("select * from next_steps where company_id = $1", [companyId]);
  const golden = problems.find((p) => p.id === c?.golden_problem_id);
  const gd = golden ? drafts.find((d) => d.problem_id === golden.id) : null;
  const lines = [
    `Company sector: ${c?.sector ?? "not given"}. Staff: ${c?.size_band ?? "not given"}. State: ${c?.state ?? "not given"}.`,
    "",
    "Problems they wrote, best score first:",
    ...problems.map(
      (p, i) =>
        `${i + 1}. ${p.title} (type: ${p.type ? PROBLEM_TYPE_INFO[p.type as ProblemType]?.label : "not set"}; data ready ${p.data_ready ?? "?"}/5; value ${p.value ?? "?"}/5; fix: ${p.fix_type ? FIX_TYPE_LABELS[p.fix_type as FixType] : "not set"}; builds foundation: ${p.builds_foundation ? "yes" : "no"}${p.shortlisted ? "; shortlisted" : ""})\n   Today: ${p.today_state ?? "-"}\n   Good would look like: ${p.future_state ?? "-"}`,
    ),
    "",
    `Golden use case: ${golden?.title ?? "not picked"}`,
    gd
      ? [
          `First project: ${gd.first_project ?? "-"}`,
          `Measure: ${gd.metric ?? "-"}`,
          `Baseline: ${gd.baseline ?? "not given"}`,
          `Target: ${gd.target ?? "not given"}`,
          `Data location: ${gd.data_location ?? "-"}`,
          `Sample access: ${gd.sample_access ?? "-"}`,
          `Approval: ${gd.approval_level ?? "-"}`,
          `Owner: ${gd.owner ?? "-"}`,
        ].join("\n")
      : "",
    "",
    `Next step they chose: ${next?.choice ? NEXT_CHOICE_LABELS[next.choice as NextChoice].label : "not chosen"}. Start: ${next?.start_timing ?? "not given"}.`,
  ];
  return lines.join("\n");
}

export function planPdfData(plan: FinalPlanRow, companyName: string, eventName: string): PlanPdfData {
  return {
    companyName,
    eventName,
    title: plan.title ?? "",
    first_project: plan.first_project ?? "",
    metric: plan.metric ?? "",
    baseline: plan.baseline ?? "",
    target: plan.target ?? "",
    recommendation: plan.recommendation ?? "",
    risks: plan.risks ?? "",
    version: plan.version,
    dateText: formatDate(plan.sent_at ?? plan.updated_at),
  };
}

export const PLAN_LIMITS = {
  title: 150,
  first_project: 1000,
  metric: 300,
  baseline: 200,
  target: 200,
  recommendation: 2500,
  risks: 1200,
} as const;
