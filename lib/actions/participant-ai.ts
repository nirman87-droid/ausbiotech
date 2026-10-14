"use server";

import { z } from "zod";
import { getDb } from "@/lib/db";
import { getParticipant } from "@/lib/session";
import { isEditingLocked } from "@/lib/rules";
import { AiUnavailable, sharpenProblem, suggestMeasure } from "@/lib/ai";
import type { GoldenDraftRow, ProblemRow } from "@/lib/types";

// AI suggestions for participants. A suggestion is only shown, never applied, until the
// person presses Accept. Every suggestion is logged in ai_suggestions.

const requestSchema = z.object({ kind: z.enum(["sharpen", "measure"]), problemId: z.string().uuid() });
export type SuggestionResult =
  | { ok: true; id: string; suggestion: Record<string, string> }
  | { ok: false; error: string };

export async function requestSuggestion(input: unknown): Promise<SuggestionResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const ctx = await getParticipant();
  if (!ctx) return { ok: false, error: "Your session has ended." };
  if (!ctx.event.ai_enabled) return { ok: false, error: "The AI helper is turned off for this workshop." };
  if (isEditingLocked(ctx.event, ctx.company)) return { ok: false, error: "Editing is closed." };

  const db = await getDb();
  const recent = await db.one<{ n: number }>(
    "select count(*) as n from ai_suggestions where company_id = $1 and created_at > now() - interval '1 hour'",
    [ctx.company.id],
  );
  if ((recent?.n ?? 0) >= 30) return { ok: false, error: "You have used the AI helper a lot this hour. Try again later." };

  const problem = await db.one<ProblemRow>(
    "select * from problems where id = $1 and company_id = $2 and deleted_at is null",
    [parsed.data.problemId, ctx.company.id],
  );
  if (!problem) return { ok: false, error: "Problem not found" };

  try {
    let field: string;
    let aiInput: Record<string, unknown>;
    let suggestion: Record<string, string>;
    if (parsed.data.kind === "sharpen") {
      field = "problem.sharpen";
      aiInput = {
        sector: ctx.company.sector,
        title: problem.title,
        today_state: problem.today_state,
        future_state: problem.future_state,
        affected_role: problem.affected_role,
      };
      suggestion = await sharpenProblem(aiInput as Parameters<typeof sharpenProblem>[0]);
    } else {
      const draft = await db.one<GoldenDraftRow>(
        "select * from golden_drafts where company_id = $1 and problem_id = $2",
        [ctx.company.id, problem.id],
      );
      field = "golden.measure";
      aiInput = {
        problem: problem.title,
        today_state: problem.today_state,
        future_state: problem.future_state,
        first_project: draft?.first_project ?? null,
      };
      suggestion = await suggestMeasure(aiInput as Parameters<typeof suggestMeasure>[0]);
    }
    const row = await db.one<{ id: string }>(
      `insert into ai_suggestions (event_id, company_id, field, input, output)
       values ($1, $2, $3, $4::jsonb, $5) returning id`,
      [ctx.event.id, ctx.company.id, field, JSON.stringify({ ...aiInput, problem_id: problem.id, person_id: ctx.person.id }), JSON.stringify(suggestion)],
    );
    return { ok: true, id: row!.id, suggestion };
  } catch (err) {
    if (err instanceof AiUnavailable) return { ok: false, error: err.message };
    console.error("AI suggestion failed", err);
    return { ok: false, error: "The AI helper could not answer. Try again." };
  }
}

const resolveSchema = z.object({ id: z.string().uuid(), accepted: z.boolean() });

export async function resolveSuggestion(input: unknown): Promise<{ ok: boolean }> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await getParticipant();
  if (!ctx) return { ok: false };
  const db = await getDb();
  await db.query("update ai_suggestions set accepted = $3 where id = $1 and company_id = $2", [
    parsed.data.id,
    ctx.company.id,
    parsed.data.accepted,
  ]);
  return { ok: true };
}
