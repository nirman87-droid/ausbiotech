import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { env } from "./env";

// AI helpers (Anthropic API). Server side only, and only when the event's AI flag is on.
// Nothing here writes to the database: callers log each suggestion in ai_suggestions,
// and a suggestion only changes a field after a person accepts it.
//
// Data residency note: these calls send workshop text to the Anthropic API, which is not
// hosted in Australia. Keep the per-event AI flag off unless ARM Hub has approved this.

const MODEL = "claude-opus-5-5";

const STYLE = `Write in plain Australian English (organisation, prioritise, analyse).
Do not use contractions. Do not use em dashes. Use short sentences and everyday words, for example "data ready" rather than "data maturity".
Never invent numbers, results, client names or facts. If a figure is unknown, say how to find it instead.
Avoid hype words such as leverage, unlock, empower, seamless, cutting-edge, transformative and journey.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.anthropicKey) throw new AiUnavailable("The AI helper is not set up. Add ANTHROPIC_API_KEY.");
  client ??= new Anthropic({ apiKey: env.anthropicKey, timeout: 60_000, maxRetries: 2 });
  return client;
}

export class AiUnavailable extends Error {}

async function ask<T>(system: string, prompt: string, schema: z.ZodType<T>, effort: "low" | "medium" = "low"): Promise<T> {
  let response;
  try {
    response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system: `${system}\n\n${STYLE}`,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    if (err instanceof AiUnavailable) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new AiUnavailable("The AI helper is busy. Try again in a minute.");
    if (err instanceof Anthropic.AuthenticationError) throw new AiUnavailable("The AI helper key is not valid.");
    if (err instanceof Anthropic.APIError) throw new AiUnavailable("The AI helper could not answer. Try again.");
    throw new AiUnavailable("The AI helper could not be reached. Try again.");
  }
  if (response.stop_reason === "refusal") throw new AiUnavailable("The AI helper could not help with this one.");
  if (!response.parsed_output) throw new AiUnavailable("The AI helper gave an answer we could not read. Try again.");
  return response.parsed_output as T;
}

const sharpenSchema = z.object({
  title: z.string().describe("The problem in one clear sentence, 10 to 150 characters"),
  today_state: z.string().describe("What happens today, two or three sentences"),
  future_state: z.string().describe("What good would look like, two or three sentences"),
});
export type Sharpened = z.infer<typeof sharpenSchema>;

export function sharpenProblem(input: {
  sector: string | null;
  title: string;
  today_state: string | null;
  future_state: string | null;
  affected_role: string | null;
}): Promise<Sharpened> {
  return ask(
    "You help small Australian life sciences companies describe a messy data problem clearly, so it can become an AI starter project. Keep their meaning. Make it specific and concrete. Do not add details they did not give.",
    `Sector: ${input.sector ?? "not given"}
Who does this work: ${input.affected_role ?? "not given"}
Their problem sentence: ${input.title || "(empty)"}
What happens today: ${input.today_state || "(empty)"}
What good would look like: ${input.future_state || "(empty)"}

Rewrite these three fields so they are sharper and easier to act on. Keep the title under 150 characters.`,
    sharpenSchema,
  );
}

const measureSchema = z.object({
  metric: z.string().describe("One measure of success, written as something you can count or time"),
  baseline: z.string().describe("How to find today's figure. Do not guess a number."),
  target: z.string().describe("A sensible way to set the target, without inventing a number"),
});
export type MeasureSuggestion = z.infer<typeof measureSchema>;

export function suggestMeasure(input: {
  problem: string;
  today_state: string | null;
  future_state: string | null;
  first_project: string | null;
}): Promise<MeasureSuggestion> {
  return ask(
    "You help small life sciences companies choose one simple, honest measure for a first AI project. Prefer time saved, error rate, turnaround time or cost per batch.",
    `Problem: ${input.problem}
What happens today: ${input.today_state || "(not given)"}
What good would look like: ${input.future_state || "(not given)"}
First project idea: ${input.first_project || "(not given)"}

Suggest one measure, how to find the baseline, and how to set a target.`,
    measureSchema,
  );
}

const planSchema = z.object({
  title: z.string(),
  first_project: z.string(),
  metric: z.string(),
  baseline: z.string(),
  target: z.string(),
  recommendation: z.string().describe("Three to six short paragraphs or numbered steps"),
  risks: z.string().describe("Two to four risks with a plain mitigation for each"),
});
export type PlanDraft = z.infer<typeof planSchema>;

export function draftPlan(input: string): Promise<PlanDraft> {
  return ask(
    "You are drafting an AI starter plan for a small Australian life sciences company after a workshop with ARM Hub. Base every statement on the workshop answers given. Where the company gave a baseline or target, use it exactly. Where they did not, say how to measure it. An ARM Hub expert will review your draft before it is sent.",
    `${input}\n\nDraft the plan.`,
    planSchema,
    "medium",
  );
}

const themesSchema = z.object({
  themes: z.array(
    z.object({
      title: z.string(),
      summary: z.string().describe("Two or three sentences"),
      companies: z.number().int().describe("How many companies mentioned this theme"),
    }),
  ),
});
export type Themes = z.infer<typeof themesSchema>;

export function commonThemes(input: string): Promise<Themes> {
  return ask(
    "You summarise common themes across workshop answers from many life sciences companies. Count carefully. Do not name companies. Give between three and six themes.",
    `${input}\n\nWhat are the common themes?`,
    themesSchema,
    "medium",
  );
}
