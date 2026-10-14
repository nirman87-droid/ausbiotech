import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadPlanForToken } from "@/lib/plan-access";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Your AI starter plan", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-2 whitespace-pre-wrap text-lg leading-relaxed">{children}</div>
    </section>
  );
}

// P9: the final plan, read only, from a personal emailed link.
export default async function PlanPage({ params }: { params: Promise<{ personToken: string }> }) {
  const { personToken } = await params;
  const data = await loadPlanForToken(personToken);
  if (!data) {
    return (
      <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
        <p className="mono-label">ARM Hub AI Adopt</p>
        <h1 className="mt-2 text-3xl font-semibold">This link has expired or is not valid</h1>
        <p className="mt-3 text-lg">Personal plan links work for 90 days. Ask the ARM Hub team to send you a new one.</p>
      </main>
    );
  }
  const { plan, event } = data;
  if (!plan) {
    return (
      <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
        <p className="mono-label">{data.company_name}</p>
        <h1 className="mt-2 text-3xl font-semibold">Your plan is not ready yet</h1>
        <p className="mt-3 text-lg">
          We will email you when it is ready{event.plans_due_date ? `, by ${formatDate(event.plans_due_date)}` : ""}.
        </p>
      </main>
    );
  }

  // Record the first time anyone at the company opens this version.
  if (!plan.opened_at) {
    const db = await getDb();
    const updated = await db.query(
      "update final_plans set opened_at = now(), status = 'opened' where id = $1 and opened_at is null returning id",
      [plan.id],
    );
    if (updated.length) {
      await audit(db, { eventId: event.id, actor: { type: "participant", id: data.person_id }, action: "open_plan", entity: "final_plans", entityId: plan.id, diff: { version: plan.version } });
    }
  }

  const link = `/plan/${personToken}`;
  const mailBody = encodeURIComponent(
    `Hi team,\n\nOur AI starter plan from ARM Hub is ready: ${plan.title ?? ""}\n\nFirst project: ${plan.first_project ?? ""}\n\nEveryone registered from ${data.company_name} got their own link by email. I have attached the PDF.\n`,
  );

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <p className="mono-label">ARM Hub AI Adopt</p>
          <p className="text-sm text-muted">Version {plan.version}{plan.sent_at ? ` · ${formatDate(plan.sent_at)}` : ""}</p>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        <p className="mono-label">{data.company_name} · AI starter plan</p>
        <h1 className="mt-2 text-4xl font-semibold">{plan.title}</h1>
        <div className="no-print mt-6 flex flex-wrap gap-2">
          <a className="btn" href={`${link}/pdf`}>Download PDF</a>
          <a className="btn btn-secondary" href={`mailto:?subject=${encodeURIComponent(`Our AI starter plan: ${plan.title ?? ""}`)}&body=${mailBody}`}>
            Email to my team
          </a>
          {event.booking_url && (
            <a className="btn btn-secondary" href={event.booking_url} target="_blank" rel="noreferrer">Book a follow-up</a>
          )}
        </div>
        <Block title="Your first project">{plan.first_project}</Block>
        <section className="mt-8">
          <h2 className="text-xl font-semibold">How you will know it worked</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="card p-4"><dt className="mono-label">Measure</dt><dd className="mt-1 text-ink">{plan.metric}</dd></div>
            <div className="card p-4"><dt className="mono-label">Today</dt><dd className="mt-1 text-ink">{plan.baseline || "To be measured"}</dd></div>
            <div className="card p-4"><dt className="mono-label">Target</dt><dd className="mt-1 text-ink">{plan.target || "To be set"}</dd></div>
          </dl>
        </section>
        <Block title="Our recommendation">{plan.recommendation}</Block>
        {plan.risks && <Block title="Risks and how to manage them">{plan.risks}</Block>}
        <p className="mt-12 text-sm text-muted">
          This page is just for you. Read our <a className="link" href="/privacy">privacy statement</a>.
        </p>
      </main>
    </>
  );
}
