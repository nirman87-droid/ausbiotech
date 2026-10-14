"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { ensurePlan, latestPlan, participantAnswersText, PLAN_LIMITS } from "@/lib/plans";
import { makePersonToken } from "@/lib/sign";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { AiUnavailable, draftPlan } from "@/lib/ai";
import type { FinalPlanRow } from "@/lib/types";

// A5: plan review. Staff edit the newest version, mark it ready, then send it.

type Result = { ok: true; message?: string } | { ok: false; error: string };
const slug = z.string().regex(/^[a-z0-9-]{3,60}$/);
const t = (max: number) => z.string().max(max).transform((v) => v.trim() || null);
const fieldsSchema = z.object({
  title: t(PLAN_LIMITS.title),
  first_project: t(PLAN_LIMITS.first_project),
  metric: t(PLAN_LIMITS.metric),
  baseline: t(PLAN_LIMITS.baseline),
  target: t(PLAN_LIMITS.target),
  recommendation: t(PLAN_LIMITS.recommendation),
  risks: t(PLAN_LIMITS.risks),
});
const refSchema = z.object({ slug, companyId: z.string().uuid() });

async function context(input: unknown, schema: z.ZodTypeAny = refSchema) {
  const staff = await requireStaff("admin");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Please check the plan fields. One may be too long." } as const;
  const data = parsed.data as { slug: string; companyId: string } & Record<string, unknown>;
  const event = await getEventBySlug(data.slug);
  if (!event) return { error: "Event not found" } as const;
  const db = await getDb();
  const company = await db.one<{ id: string; name: string }>("select id, name from companies where id = $1 and event_id = $2", [
    data.companyId,
    event.id,
  ]);
  if (!company) return { error: "Company not found" } as const;
  return { staff, event, company, data, db } as const;
}

export async function savePlan(input: unknown): Promise<Result> {
  const ctx = await context(input, refSchema.extend({ fields: fieldsSchema }));
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { staff, event, company, db } = ctx;
  const f = ctx.data.fields as z.infer<typeof fieldsSchema>;
  await db.tx(async (q) => {
    const current = await ensurePlan(q, company.id);
    const values = [f.title, f.first_project, f.metric, f.baseline, f.target, f.recommendation, f.risks, staff.id];
    let plan: FinalPlanRow;
    if (current.status === "sent" || current.status === "opened") {
      // Keep the sent version as it was. Changes go into a new version.
      plan = (await q.one<FinalPlanRow>(
        `insert into final_plans (company_id, version, status, title, first_project, metric, baseline, target, recommendation, risks, author_id)
         values ($9, $10, 'in_review', $1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [...values, company.id, current.version + 1],
      ))!;
    } else {
      plan = (await q.one<FinalPlanRow>(
        `update final_plans set title=$1, first_project=$2, metric=$3, baseline=$4, target=$5, recommendation=$6, risks=$7,
           author_id=$8, status = case when status = 'draft_received' then 'in_review' else status end
         where id = $9 returning *`,
        [...values, current.id],
      ))!;
    }
    await audit(q, { eventId: event.id, actor: { type: "staff", id: staff.id }, action: "save_plan", entity: "final_plans", entityId: plan.id, diff: { version: plan.version, ...f } });
  });
  revalidatePath(`/console/${event.slug}/plans`);
  return { ok: true, message: "Saved." };
}

export async function markReady(input: unknown): Promise<Result> {
  const ctx = await context(input);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { staff, event, company, db } = ctx;
  const plan = await latestPlan(db, company.id);
  if (!plan) return { ok: false, error: "Save the plan first." };
  if (plan.status === "sent" || plan.status === "opened") return { ok: false, error: "This version has been sent. Edit and save to start a new version." };
  const missing = (["title", "first_project", "metric", "recommendation"] as const).filter((k) => !plan[k]?.trim());
  if (missing.length) return { ok: false, error: `Fill in before marking ready: ${missing.join(", ").replace(/_/g, " ")}.` };
  await db.tx(async (q) => {
    await q.query("update final_plans set status = 'ready' where id = $1", [plan.id]);
    await audit(q, { eventId: event.id, actor: { type: "staff", id: staff.id }, action: "mark_ready", entity: "final_plans", entityId: plan.id, diff: { version: plan.version } });
  });
  revalidatePath(`/console/${event.slug}/plans`);
  return { ok: true, message: "Marked ready." };
}

// Emails a personal P9 link to every registered person at the company with an email.
// A re-send (any version after one has gone out) sends a short update email instead.
export async function sendPlan(input: unknown): Promise<Result> {
  const ctx = await context(input);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { staff, event, company, db } = ctx;
  const plan = await latestPlan(db, company.id);
  if (!plan || plan.status !== "ready") return { ok: false, error: "Mark the plan ready before sending." };
  const people = await db.query<{ id: string; name: string; email: string }>(
    "select id, name, email from people where company_id = $1 and email is not null and email <> ''",
    [company.id],
  );
  if (people.length === 0) return { ok: false, error: "Nobody at this company has an email address." };
  const previous = await db.one<{ n: number }>(
    "select count(*) as n from final_plans where company_id = $1 and sent_at is not null and id <> $2",
    [company.id, plan.id],
  );
  const isUpdate = (previous?.n ?? 0) > 0;
  const base = env.appUrl.replace(/\/$/, "");
  let failed = 0;
  for (const p of people) {
    const link = `${base}/plan/${makePersonToken(p.id)}`;
    const first = p.name.split(" ")[0];
    const text = isUpdate
      ? `Hi ${first},\n\nWe have updated the AI starter plan for ${company.name}.\n\nSee the latest version here:\n${link}\n\nThis link is just for you and works for 90 days.\n\nThe ARM Hub team`
      : `Hi ${first},\n\nThank you for joining us at ${event.name}. The AI starter plan for ${company.name} is ready.\n\nOpen your plan here:\n${link}\n\nYou can download it as a PDF and share it with your team. This link is just for you and works for 90 days.\n\nThe ARM Hub team`;
    const r = await sendEmail({
      eventId: event.id,
      to: p.email,
      subject: isUpdate ? `Updated: your AI starter plan for ${company.name}` : `Your AI starter plan for ${company.name}`,
      text,
    });
    if (!r.ok) failed++;
  }
  await db.tx(async (q) => {
    await q.query("update final_plans set status = 'sent', sent_at = now(), pdf_path = $2 where id = $1", [
      plan.id,
      `/console/${event.slug}/plans/${company.id}/pdf?version=${plan.version}`,
    ]);
    await audit(q, {
      eventId: event.id,
      actor: { type: "staff", id: staff.id },
      action: isUpdate ? "resend_plan" : "send_plan",
      entity: "final_plans",
      entityId: plan.id,
      diff: { version: plan.version, recipients: people.length, failed },
    });
  });
  revalidatePath(`/console/${event.slug}/plans`);
  if (failed) return { ok: false, error: `Sent to ${people.length - failed} of ${people.length}. ${failed} emails failed. Check the email log.` };
  return {
    ok: true,
    message: `${isUpdate ? "Update sent" : "Sent"} to ${people.length} ${people.length === 1 ? "person" : "people"}${env.resendKey ? "" : " (logged only: email is not set up)"}.`,
  };
}

export type AiPlanResult = { ok: true; id: string; fields: Record<string, string> } | { ok: false; error: string };

export async function aiDraftPlan(input: unknown): Promise<AiPlanResult> {
  const ctx = await context(input);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { event, company, db } = ctx;
  if (!event.ai_enabled) return { ok: false, error: "The AI helper is turned off for this event." };
  const answers = await participantAnswersText(db, company.id);
  try {
    const fields = await draftPlan(
      `Workshop: ${event.name}. Plans are due ${event.plans_due_date ? formatDate(event.plans_due_date) : "soon"}.\n\n${answers}`,
    );
    const row = await db.one<{ id: string }>(
      "insert into ai_suggestions (event_id, company_id, field, input, output) values ($1, $2, 'plan.draft', $3::jsonb, $4) returning id",
      [event.id, company.id, JSON.stringify({ answers }), JSON.stringify(fields)],
    );
    const clipped = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, String(v).slice(0, PLAN_LIMITS[k as keyof typeof PLAN_LIMITS] ?? 1000)]),
    );
    return { ok: true, id: row!.id, fields: clipped };
  } catch (err) {
    if (err instanceof AiUnavailable) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "The AI helper could not draft this plan." };
  }
}

// Records whether staff used or discarded an AI draft.
export async function resolveStaffSuggestion(input: unknown): Promise<{ ok: boolean }> {
  await requireStaff("admin");
  const parsed = z.object({ id: z.string().uuid(), accepted: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const db = await getDb();
  await db.query("update ai_suggestions set accepted = $2 where id = $1", [parsed.data.id, parsed.data.accepted]);
  return { ok: true };
}
