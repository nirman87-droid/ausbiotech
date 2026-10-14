import type { Metadata } from "next";
import { requireParticipant } from "@/lib/session";
import { pollAnswersForPerson, pollQuestions } from "@/lib/queries";
import { PageTitle, stageGate } from "@/lib/stage-gate";
import { STAGE_INFO } from "@/lib/copy";
import { canOpenStage } from "@/lib/rules";
import { PollForm } from "./PollForm";

export const metadata: Metadata = { title: "Warm-up poll" };

// P3: the warm-up poll. Answers are per person and shown on the big screen as counts only.
export default async function PollPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const ctx = await requireParticipant(eventSlug);
  const gate = stageGate(ctx, "poll");
  if (gate) return gate;
  const [questions, answers] = await Promise.all([pollQuestions(ctx.event.id), pollAnswersForPerson(ctx.person.id)]);
  const nextOpen = canOpenStage(ctx.event.current_stage, "problems");
  return (
    <div className="max-w-3xl">
      <PageTitle
        step="Step 2"
        title="Warm-up poll"
        intro="A few quick questions, just for you. The room sees totals only, never names."
      />
      {questions.length === 0 ? (
        <p className="notice">There are no poll questions for this workshop.</p>
      ) : (
        <PollForm
          questions={questions}
          answers={answers}
          open={ctx.event.poll_open}
          nextHref={nextOpen ? `/${ctx.event.slug}/${STAGE_INFO.problems.path}` : null}
          nextLabel={nextOpen ? STAGE_INFO.problems.label : null}
        />
      )}
    </div>
  );
}
