import "server-only";
import { z } from "zod";
import { getDb, type Queryable } from "./db";
import { audit } from "./audit";
import {
  APPROVAL_LEVELS,
  CONSENT_TEXT,
  FIX_TYPES,
  FREQUENCIES,
  NEXT_CHOICES,
  PLACEHOLDER_PREFIX,
  PROBLEM_TYPES,
  SECTORS,
  SIZE_BANDS,
  START_TIMINGS,
  STATES,
  type Stage,
} from "./copy";
import { autoShortlistIds, canOpenStage, computeScore, isEditingLocked, normaliseWeights, PROBLEM_LIMITS } from "./rules";
import type { Participant } from "./session";
import type { ProblemRow } from "./types";

// Autosave operations sent by participant screens.
// Each op changes one field. Ops are validated here with Zod, checked against the
// session's company and the current stage, applied, and written to the audit log.

const uuid = z.string().uuid();
const text = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((v) => (v === "" ? null : v));
const oneOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).nullable();
const rating = z.number().int().min(1).max(5).nullable();

const problemFields = {
  title: z.string().max(PROBLEM_LIMITS.titleMax),
  today_state: text(2000),
  future_state: text(2000),
  type: oneOf(PROBLEM_TYPES),
  affected_role: text(120),
  frequency: oneOf(FREQUENCIES),
  data_ready: rating,
  value: rating,
  fix_type: oneOf(FIX_TYPES),
  builds_foundation: z.boolean(),
  shortlisted: z.boolean(),
} as const;

// Fields set on P5 need the shortlist stage. The rest of the card belongs to P4.
const SHORTLIST_FIELDS = new Set(["data_ready", "value", "fix_type", "builds_foundation", "shortlisted"]);

const goldenFields = {
  first_project: text(1000),
  metric: text(500),
  baseline: text(300),
  target: text(300),
  data_location: text(500),
  sample_access: text(500),
  approval_level: oneOf(APPROVAL_LEVELS),
  owner: text(200),
  check_mvp: z.boolean(),
  check_collab: z.boolean(),
  check_metric: z.boolean(),
  check_data: z.boolean(),
} as const;

const nextFields = {
  choice: oneOf(NEXT_CHOICES),
  start_timing: oneOf(START_TIMINGS),
  extra_contact: text(300),
} as const;

const companyFields = {
  name: z.string().trim().min(2).max(120),
  website: text(200),
  sector: oneOf(SECTORS),
  size_band: oneOf(SIZE_BANDS),
  state: oneOf(STATES),
  golden_problem_id: uuid.nullable(),
} as const;

const personFields = {
  name: z.string().trim().min(1, "Your name cannot be empty.").max(120),
  role: text(120),
  marketing_consent: z.boolean(),
} as const;

const fieldEnum = <T extends Record<string, unknown>>(o: T) =>
  z.enum(Object.keys(o) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]]);

export const opSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("problem.create"), id: uuid, position: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("problem.delete"), id: uuid }),
  z.object({ kind: z.literal("problem.set"), id: uuid, field: fieldEnum(problemFields), value: z.unknown() }),
  z.object({ kind: z.literal("shortlist.reset") }),
  z.object({ kind: z.literal("golden.set"), id: uuid, field: fieldEnum(goldenFields), value: z.unknown() }),
  z.object({ kind: z.literal("next.set"), field: fieldEnum(nextFields), value: z.unknown() }),
  z.object({ kind: z.literal("company.set"), field: fieldEnum(companyFields), value: z.unknown() }),
  z.object({ kind: z.literal("person.set"), id: uuid.optional(), field: fieldEnum(personFields), value: z.unknown() }),
  z.object({ kind: z.literal("poll.answer"), id: uuid, value: z.string().max(200) }),
]);
export type Op = z.infer<typeof opSchema>;

export const batchSchema = z.object({ ops: z.array(z.unknown()).min(1).max(100) });

export class OpError extends Error {
  constructor(
    message: string,
    public permanent = true,
  ) {
    super(message);
  }
}

function stageFor(op: Op): Stage {
  switch (op.kind) {
    case "poll.answer":
      return "poll";
    case "problem.set":
      return SHORTLIST_FIELDS.has(op.field) ? "shortlist" : "problems";
    case "problem.create":
    case "problem.delete":
      return "problems";
    case "shortlist.reset":
      return "shortlist";
    case "golden.set":
      return "golden";
    case "company.set":
      return op.field === "golden_problem_id" ? "golden" : "arrival";
    case "next.set":
      return "next_steps";
    case "person.set":
      return op.field === "marketing_consent" ? "next_steps" : "arrival";
  }
}

function parseValue(schema: z.ZodTypeAny, value: unknown) {
  const r = schema.safeParse(value);
  if (!r.success) throw new OpError(`Invalid value: ${r.error.issues[0]?.message ?? "rejected"}`);
  return r.data;
}

// Recomputes the automatic top 3 unless the company has changed the pick by hand.
async function refreshAutoShortlist(q: Queryable, companyId: string) {
  const problems = await q.query<ProblemRow>(
    "select * from problems where company_id = $1 and deleted_at is null",
    [companyId],
  );
  if (problems.some((p) => p.shortlist_overridden)) return;
  const pick = autoShortlistIds(problems);
  const changed = problems.filter((p) => p.shortlisted !== pick.has(p.id));
  if (changed.length === 0) return;
  for (const p of changed) {
    await q.query("update problems set shortlisted = $2 where id = $1", [p.id, pick.has(p.id)]);
  }
  await q.query("update companies set shortlist_confirmed_at = null where id = $1", [companyId]);
}

async function applyOp(q: Queryable, ctx: Participant, op: Op) {
  const companyId = ctx.company.id;
  const actor = { type: "participant" as const, id: ctx.person.id };
  const log = (action: string, entity: string, entityId: string | null, diff: unknown) =>
    audit(q, { eventId: ctx.event.id, actor, action, entity, entityId, diff });

  const ownProblem = async (id: string) => {
    const p = await q.one<ProblemRow>(
      "select * from problems where id = $1 and company_id = $2 and deleted_at is null",
      [id, companyId],
    );
    if (!p) throw new OpError("Problem not found");
    return p;
  };

  switch (op.kind) {
    case "problem.create": {
      const existing = await q.one<{ company_id: string; deleted_at: Date | null }>(
        "select company_id, deleted_at from problems where id = $1",
        [op.id],
      );
      if (existing) {
        if (existing.company_id !== companyId) throw new OpError("Problem not found");
        return; // already created by an earlier retry
      }
      const count = await q.one<{ n: number }>(
        "select count(*) as n from problems where company_id = $1 and deleted_at is null",
        [companyId],
      );
      if ((count?.n ?? 0) >= PROBLEM_LIMITS.max) throw new OpError(`You can add up to ${PROBLEM_LIMITS.max} problems.`);
      await q.query("insert into problems (id, company_id, position) values ($1, $2, $3)", [op.id, companyId, op.position]);
      await log("create", "problems", op.id, { position: op.position });
      await refreshAutoShortlist(q, companyId);
      return;
    }
    case "problem.delete": {
      await ownProblem(op.id);
      await q.query("update problems set deleted_at = now(), shortlisted = false where id = $1", [op.id]);
      await q.query("update companies set golden_problem_id = null where id = $1 and golden_problem_id = $2", [
        companyId,
        op.id,
      ]);
      await log("delete", "problems", op.id, null);
      await refreshAutoShortlist(q, companyId);
      return;
    }
    case "problem.set": {
      const problem = await ownProblem(op.id);
      const value = parseValue(problemFields[op.field], op.value);
      await q.query(`update problems set ${op.field} = $2 where id = $1`, [op.id, value]);
      if (op.field === "shortlisted") {
        // A hand pick replaces the automatic pick for the whole company.
        await q.query("update problems set shortlist_overridden = true where company_id = $1", [companyId]);
        await q.query("update companies set shortlist_confirmed_at = null where id = $1", [companyId]);
        if (!value) {
          await q.query("update companies set golden_problem_id = null where id = $1 and golden_problem_id = $2", [
            companyId,
            op.id,
          ]);
        }
      }
      if (op.field === "data_ready" || op.field === "value" || op.field === "builds_foundation") {
        const next = { ...problem, [op.field]: value };
        const score = computeScore(next, normaliseWeights(ctx.event.score_weights));
        await q.query("update problems set score = $2 where id = $1", [op.id, score]);
        await refreshAutoShortlist(q, companyId);
      }
      await log("update", "problems", op.id, { [op.field]: value });
      return;
    }
    case "shortlist.reset": {
      await q.query("update problems set shortlist_overridden = false where company_id = $1", [companyId]);
      await refreshAutoShortlist(q, companyId);
      await log("reset_shortlist", "problems", null, null);
      return;
    }
    case "golden.set": {
      const problem = await ownProblem(op.id);
      if (!problem.shortlisted) throw new OpError("Pick one of your shortlisted problems.");
      const value = parseValue(goldenFields[op.field], op.value);
      await q.query(
        `insert into golden_drafts (company_id, problem_id, ${op.field}, saved_at) values ($1, $2, $3, now())
         on conflict (company_id, problem_id) do update set ${op.field} = excluded.${op.field}, saved_at = now()`,
        [companyId, op.id, value],
      );
      await log("update", "golden_drafts", op.id, { [op.field]: value });
      return;
    }
    case "next.set": {
      const value = parseValue(nextFields[op.field], op.value);
      await q.query(
        `insert into next_steps (company_id, ${op.field}) values ($1, $2)
         on conflict (company_id) do update set ${op.field} = excluded.${op.field}`,
        [companyId, value],
      );
      await log("update", "next_steps", companyId, { [op.field]: value });
      return;
    }
    case "company.set": {
      const value = parseValue(companyFields[op.field], op.value);
      if (op.field === "golden_problem_id" && value) {
        const p = await ownProblem(value as string);
        if (!p.shortlisted) throw new OpError("Pick one of your shortlisted problems.");
      }
      const before = await q.one<Record<string, unknown>>(`select ${op.field} as v from companies where id = $1`, [companyId]);
      try {
        await q.query(`update companies set ${op.field} = $2 where id = $1`, [companyId, value]);
        // A placeholder organisation stops being "to confirm" once someone gives it a real name.
        if (op.field === "name" && !String(value).startsWith(PLACEHOLDER_PREFIX)) {
          await q.query("update companies set flags = flags - 'org_to_confirm' where id = $1", [companyId]);
        }
      } catch (err: any) {
        if (err?.code === "23505") throw new OpError("Another organisation already uses that name.");
        throw err;
      }
      await log("update", "companies", companyId, { field: op.field, from: before?.v ?? null, to: value });
      return;
    }
    case "person.set": {
      const personId = op.id ?? ctx.person.id;
      if ((op.field === "marketing_consent" || op.field === "name") && personId !== ctx.person.id) {
        throw new OpError("You can only change your own name and consent.");
      }
      const person = await q.one<{ id: string; name: string; role: string | null }>(
        "select id, name, role from people where id = $1 and company_id = $2",
        [personId, companyId],
      );
      if (!person) throw new OpError("Person not found");
      const value = parseValue(personFields[op.field], op.value);
      if (op.field === "marketing_consent") {
        await q.query(
          "update people set marketing_consent = $2, consent_text = $3, consent_at = $4 where id = $1",
          [personId, value, value ? CONSENT_TEXT : null, value ? new Date().toISOString() : null],
        );
        await log(value ? "consent_given" : "consent_withdrawn", "people", personId, value ? { consent_text: CONSENT_TEXT } : null);
      } else if (op.field === "name") {
        await q.query("update people set name = $2 where id = $1", [personId, value]);
        await log("update", "people", personId, { field: "name", from: person.name, to: value });
      } else {
        await q.query("update people set role = $2 where id = $1", [personId, value]);
        await log("update", "people", personId, { field: "role", from: person.role, to: value });
      }
      return;
    }
    case "poll.answer": {
      if (!ctx.event.poll_open) throw new OpError("The poll is closed.");
      const question = await q.one<{ options: string[] }>(
        "select options from poll_questions where id = $1 and event_id = $2",
        [op.id, ctx.event.id],
      );
      if (!question) throw new OpError("Question not found");
      if (!question.options.includes(op.value)) throw new OpError("Pick one of the options.");
      await q.query(
        `insert into poll_responses (question_id, person_id, answer) values ($1, $2, $3)
         on conflict (question_id, person_id) do update set answer = excluded.answer`,
        [op.id, ctx.person.id, op.value],
      );
      await log("answer", "poll_responses", op.id, { answer: op.value });
      return;
    }
  }
}

export type OpResult = { ok: true } | { ok: false; error: string; permanent: boolean };

// Applies a batch of ops in order. Each op runs in its own transaction, so one bad op
// does not block the others. Returns one result per op.
export async function applyOps(ctx: Participant, rawOps: unknown[]): Promise<{ results: OpResult[]; touchedPoll: boolean }> {
  const db = await getDb();
  const results: OpResult[] = [];
  let touchedPoll = false;
  const locked = isEditingLocked(ctx.event, ctx.company);
  for (const raw of rawOps) {
    const parsed = opSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({ ok: false, error: "Invalid change", permanent: true });
      continue;
    }
    const op = parsed.data;
    if (locked) {
      results.push({ ok: false, error: "Editing is closed.", permanent: true });
      continue;
    }
    if (!canOpenStage(ctx.event.current_stage, stageFor(op))) {
      results.push({ ok: false, error: "This stage is not open yet.", permanent: true });
      continue;
    }
    try {
      await db.tx((q) => applyOp(q, ctx, op));
      if (op.kind === "poll.answer") touchedPoll = true;
      results.push({ ok: true });
    } catch (err) {
      if (err instanceof OpError) results.push({ ok: false, error: err.message, permanent: err.permanent });
      else {
        console.error("autosave op failed", err);
        results.push({ ok: false, error: "Could not save. Retrying.", permanent: false });
      }
    }
  }
  if (results.some((r) => r.ok)) {
    await db.query("update companies set last_activity_at = now() where id = $1", [ctx.company.id]);
  }
  return { results, touchedPoll };
}
