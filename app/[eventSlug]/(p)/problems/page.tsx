import type { Metadata } from "next";
import { requireParticipant } from "@/lib/session";
import { problemsForCompany } from "@/lib/queries";
import { PageTitle, stageGate } from "@/lib/stage-gate";
import { STAGE_INFO } from "@/lib/copy";
import { canOpenStage } from "@/lib/rules";
import { ProblemsBoard } from "./ProblemsBoard";

export const metadata: Metadata = { title: "Messy data problems" };

// P4: up to four messy data problems, written together by the company's team.
export default async function ProblemsPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const ctx = await requireParticipant(eventSlug);
  const gate = stageGate(ctx, "problems");
  if (gate) return gate;
  const problems = await problemsForCompany(ctx.company.id);
  const shortlistOpen = canOpenStage(ctx.event.current_stage, "shortlist");
  return (
    <>
      <PageTitle
        step="Step 3"
        title="Messy data problems"
        intro="Write down up to four problems where data slows your team down. Your teammates can edit at the same time."
      />
      <ProblemsBoard
        problems={problems.map((p) => ({
          id: p.id,
          position: p.position,
          title: p.title,
          today_state: p.today_state,
          future_state: p.future_state,
          type: p.type,
          affected_role: p.affected_role,
          frequency: p.frequency,
        }))}
        aiEnabled={ctx.event.ai_enabled}
        shortlistHref={shortlistOpen ? `/${ctx.event.slug}/${STAGE_INFO.shortlist.path}` : null}
      />
    </>
  );
}
