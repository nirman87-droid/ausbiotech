"use server";

import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getParticipant } from "@/lib/session";
import { canOpenStage, isEditingLocked, requiredShortlistCount, titleError } from "@/lib/rules";
import { CHOICES_NEEDING_CONSENT, type NextChoice } from "@/lib/copy";
import { notify } from "@/lib/live";
import { topics } from "@/lib/topics";
import type { ProblemRow } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

// These actions take no input from the browser. Everything comes from the session,
// so there is nothing for Zod to validate here.

// P5: confirm the shortlist. Exactly 3, or every problem if there are fewer than 3.
export async function confirmShortlist(): Promise<Result> {
  const ctx = await getParticipant();
  if (!ctx) return { ok: false, error: "Your session has ended." };
  if (isEditingLocked(ctx.event, ctx.company)) return { ok: false, error: "Editing is closed." };
  if (!canOpenStage(ctx.event.current_stage, "shortlist")) return { ok: false, error: "This stage is not open yet." };
  const db = await getDb();
  const problems = await db.query<ProblemRow>("select * from problems where company_id = $1 and deleted_at is null", [
    ctx.company.id,
  ]);
  if (problems.length === 0) return { ok: false, error: "Add at least one problem first." };
  if (problems.some((p) => titleError(p.title))) return { ok: false, error: "Each problem needs a sentence of at least 10 characters." };
  const need = requiredShortlistCount(problems.length);
  const picked = problems.filter((p) => p.shortlisted).length;
  if (picked !== need) return { ok: false, error: `Pick exactly ${need}. You have picked ${picked}.` };
  await db.tx(async (q) => {
    await q.query("update companies set shortlist_confirmed_at = now(), last_activity_at = now() where id = $1", [ctx.company.id]);
    await audit(q, {
      eventId: ctx.event.id,
      actor: { type: "participant", id: ctx.person.id },
      action: "confirm_shortlist",
      entity: "companies",
      entityId: ctx.company.id,
      diff: { shortlisted: problems.filter((p) => p.shortlisted).map((p) => p.id) },
    });
  });
  await notify([topics.company(ctx.company.id), topics.activity(ctx.event.id)]);
  return { ok: true };
}

// P7: Finish. followup and funding need this person's consent first.
export async function submitNextSteps(): Promise<Result> {
  const ctx = await getParticipant();
  if (!ctx) return { ok: false, error: "Your session has ended." };
  if (isEditingLocked(ctx.event, ctx.company)) return { ok: false, error: "Editing is closed." };
  if (!canOpenStage(ctx.event.current_stage, "next_steps")) return { ok: false, error: "This stage is not open yet." };
  const db = await getDb();
  const next = await db.one<{ choice: NextChoice | null }>("select choice from next_steps where company_id = $1", [ctx.company.id]);
  if (!next?.choice) return { ok: false, error: "Choose what you would like to happen next." };
  const person = await db.one<{ marketing_consent: boolean }>("select marketing_consent from people where id = $1", [ctx.person.id]);
  if (CHOICES_NEEDING_CONSENT.includes(next.choice) && !person?.marketing_consent) {
    return { ok: false, error: "Tick the consent box so we can contact you." };
  }
  await db.tx(async (q) => {
    await q.query(
      "update next_steps set submitted_by = $2, submitted_at = now() where company_id = $1",
      [ctx.company.id, ctx.person.id],
    );
    await q.query("update companies set last_activity_at = now() where id = $1", [ctx.company.id]);
    await audit(q, {
      eventId: ctx.event.id,
      actor: { type: "participant", id: ctx.person.id },
      action: "submit_next_steps",
      entity: "next_steps",
      entityId: ctx.company.id,
      diff: { choice: next.choice },
    });
  });
  await notify([topics.company(ctx.company.id), topics.activity(ctx.event.id)]);
  return { ok: true };
}
