import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug, goldenDraftsForCompany, nextStepsForCompany, problemsForCompany } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { ensurePlan } from "@/lib/plans";
import { rankProblems } from "@/lib/rules";
import { PLAN_STATUS_LABELS, type PlanStatus } from "@/lib/copy";
import { GoldenSummary, NextSummary } from "@/components/Answers";
import { PlanEditor } from "./PlanEditor";
import type { FacilitatorNotesRow, FinalPlanRow } from "@/lib/types";

export const metadata: Metadata = { title: "Plans" };

const LEAD_ORDER: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
const STATUS_ORDER: Record<string, number> = { draft_received: 0, in_review: 1, ready: 2, sent: 3, opened: 4, none: 5 };

type QueueRow = {
  id: string;
  name: string;
  table_number: number | null;
  lead_rating: string | null;
  plan_status: PlanStatus | null;
  plan_version: number | null;
  next_submitted: boolean;
};

// A5: plan review. Queue, the participant's draft with notes, and the plan editor.
export default async function PlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { eventSlug } = await params;
  const { c } = await searchParams;
  await requireStaff("admin"); // plans are admin only (spec section 4)
  const event = await getEventBySlug(eventSlug);
  if (!event) notFound();
  const db = await getDb();
  const queue = (
    await db.query<QueueRow>(
      `select co.id, co.name, t.number as table_number, fn.lead_rating,
         (select status from final_plans fp where fp.company_id = co.id order by version desc limit 1) as plan_status,
         (select version from final_plans fp where fp.company_id = co.id order by version desc limit 1) as plan_version,
         exists (select 1 from next_steps n where n.company_id = co.id and n.submitted_at is not null) as next_submitted
       from companies co left join tables t on t.id = co.table_id left join facilitator_notes fn on fn.company_id = co.id
       where co.event_id = $1`,
      [event.id],
    )
  ).sort(
    (a, b) =>
      (LEAD_ORDER[a.lead_rating ?? ""] ?? 3) - (LEAD_ORDER[b.lead_rating ?? ""] ?? 3) ||
      STATUS_ORDER[a.plan_status ?? (a.next_submitted ? "draft_received" : "none")] -
        STATUS_ORDER[b.plan_status ?? (b.next_submitted ? "draft_received" : "none")] ||
      a.name.localeCompare(b.name),
  );

  const selected = queue.find((q) => q.id === c) ?? null;
  let detail: null | {
    plan: FinalPlanRow;
    sent: FinalPlanRow[];
    goldenTitle: string | null;
    golden: Awaited<ReturnType<typeof goldenDraftsForCompany>>[number] | null;
    shortlist: { id: string; title: string; score: number }[];
    next: Awaited<ReturnType<typeof nextStepsForCompany>>;
    notes: FacilitatorNotesRow | null;
    recipients: number;
  } = null;
  if (selected) {
    const plan = await ensurePlan(db, selected.id);
    const [problems, drafts, next, notes, sent, recipients, company] = await Promise.all([
      problemsForCompany(selected.id),
      goldenDraftsForCompany(selected.id),
      nextStepsForCompany(selected.id),
      db.one<FacilitatorNotesRow>("select * from facilitator_notes where company_id = $1", [selected.id]),
      db.query<FinalPlanRow>("select * from final_plans where company_id = $1 and sent_at is not null order by version desc", [selected.id]),
      db.one<{ n: number }>("select count(*) as n from people where company_id = $1 and coalesce(email,'') <> ''", [selected.id]),
      db.one<{ golden_problem_id: string | null }>("select golden_problem_id from companies where id = $1", [selected.id]),
    ]);
    const golden = problems.find((p) => p.id === company?.golden_problem_id) ?? null;
    detail = {
      plan,
      sent,
      goldenTitle: golden?.title ?? null,
      golden: golden ? (drafts.find((d) => d.problem_id === golden.id) ?? null) : null,
      shortlist: rankProblems(problems.filter((p) => p.shortlisted && p.id !== golden?.id)).map((p) => ({ id: p.id, title: p.title, score: p.score })),
      next,
      notes,
      recipients: recipients?.n ?? 0,
    };
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_1fr_1.1fr]">
      <nav aria-labelledby="queue-title" className="xl:max-h-[calc(100vh-140px)] xl:overflow-y-auto">
        <h1 id="queue-title" className="text-2xl font-semibold">Plans</h1>
        <p className="text-sm text-muted">Hot leads first, then by status.</p>
        <ul className="mt-3 grid gap-1">
          {queue.map((q) => {
            const status = q.plan_status ? PLAN_STATUS_LABELS[q.plan_status] : q.next_submitted ? "Draft received" : "No draft yet";
            return (
              <li key={q.id}>
                <Link
                  href={`/console/${event.slug}/plans?c=${q.id}`}
                  aria-current={q.id === selected?.id ? "page" : undefined}
                  className={`block rounded-[8px] border p-2 ${q.id === selected?.id ? "border-teal bg-tint" : "border-line hover:border-teal"}`}
                >
                  <span className="block font-medium text-ink">{q.name}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1 text-xs">
                    {q.lead_rating && <span className={`pill ${q.lead_rating === "hot" ? "pill-warning" : ""}`}>{q.lead_rating}</span>}
                    <span className="pill">{status}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {selected && detail ? (
        <>
          <div className="grid h-fit min-w-0 gap-4">
            <h2 className="text-2xl font-semibold">{selected.name}</h2>
            <section className="card p-4" aria-labelledby="draft-title">
              <h3 id="draft-title" className="mb-3 text-lg font-semibold">Their golden use case</h3>
              <GoldenSummary draft={detail.golden} problemTitle={detail.goldenTitle} />
            </section>
            {detail.shortlist.length > 0 && (
              <section className="card p-4" aria-labelledby="sl-title">
                <h3 id="sl-title" className="text-lg font-semibold">Also shortlisted</h3>
                <ul className="mt-2 grid gap-1 text-sm">
                  {detail.shortlist.map((p) => <li key={p.id}>{p.title} <span className="font-mono text-muted">({p.score})</span></li>)}
                </ul>
              </section>
            )}
            <section className="card p-4" aria-labelledby="ns-title">
              <h3 id="ns-title" className="mb-2 text-lg font-semibold">Next steps</h3>
              <NextSummary next={detail.next} />
            </section>
            <section className="card border-warning-line p-4" aria-labelledby="fn-title">
              <h3 id="fn-title" className="text-lg font-semibold">Facilitator notes</h3>
              <p className="text-sm text-warning">Private. Do not copy into the plan.</p>
              {detail.notes ? (
                <dl className="mt-2 grid gap-2 text-sm">
                  <div><dt className="text-muted">Lead rating</dt><dd>{detail.notes.lead_rating ?? "Not set"}</dd></div>
                  <div><dt className="text-muted">Decision maker</dt><dd>{detail.notes.decision_maker ?? "Not set"}</dd></div>
                  <div><dt className="text-muted">Funding fit</dt><dd>{detail.notes.funding_fit ?? ""}</dd></div>
                  <div><dt className="text-muted">Signals</dt><dd className="whitespace-pre-wrap">{detail.notes.signals ?? ""}</dd></div>
                  <div><dt className="text-muted">Notes</dt><dd className="whitespace-pre-wrap">{detail.notes.notes ?? ""}</dd></div>
                  <div><dt className="text-muted">Next action</dt><dd>{detail.notes.next_action ?? ""}</dd></div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-muted">No notes.</p>
              )}
              <p className="mt-2 text-sm"><Link className="link" href={`/console/${event.slug}/company/${selected.id}`}>Open company detail</Link></p>
            </section>
          </div>
          <PlanEditor
            slug={event.slug}
            companyId={selected.id}
            initial={{
              title: detail.plan.title ?? "",
              first_project: detail.plan.first_project ?? "",
              metric: detail.plan.metric ?? "",
              baseline: detail.plan.baseline ?? "",
              target: detail.plan.target ?? "",
              recommendation: detail.plan.recommendation ?? "",
              risks: detail.plan.risks ?? "",
            }}
            status={detail.plan.status}
            version={detail.plan.version}
            aiEnabled={event.ai_enabled}
            recipients={detail.recipients}
            sentVersions={detail.sent.map((s) => ({
              version: s.version,
              sentAt: new Date(s.sent_at!).toISOString(),
              openedAt: s.opened_at ? new Date(s.opened_at).toISOString() : null,
            }))}
          />
        </>
      ) : (
        <p className="notice h-fit xl:col-span-2">Pick a company from the queue to review its plan.</p>
      )}
    </div>
  );
}
