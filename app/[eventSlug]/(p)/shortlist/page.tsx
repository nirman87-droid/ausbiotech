import type { Metadata } from "next";
import { requireParticipant } from "@/lib/session";
import { problemsForCompany, shortlistReview } from "@/lib/queries";
import { PageTitle, stageGate } from "@/lib/stage-gate";
import { STAGE_INFO } from "@/lib/copy";
import { canOpenStage, normaliseWeights, rankProblems } from "@/lib/rules";
import { ShortlistBoard } from "./ShortlistBoard";

export const metadata: Metadata = { title: "Shortlist to three" };

// P5: rate each problem, see the score, and confirm a shortlist of three.
export default async function ShortlistPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const ctx = await requireParticipant(eventSlug);
  const gate = stageGate(ctx, "shortlist");
  if (gate) return gate;
  const [problems, review] = await Promise.all([problemsForCompany(ctx.company.id), shortlistReview(ctx.company.id)]);
  const ranked = rankProblems(problems);
  return (
    <>
      <PageTitle
        step="Step 4"
        title="Shortlist to three"
        intro="Rate how ready your data is and how much each fix is worth. The best scores rise to the top."
      />
      <ShortlistBoard
        rows={ranked.map((p) => ({
          id: p.id,
          title: p.title,
          data_ready: p.data_ready,
          value: p.value,
          fix_type: p.fix_type,
          builds_foundation: p.builds_foundation,
          shortlisted: p.shortlisted,
          score: p.score,
        }))}
        weights={normaliseWeights(ctx.event.score_weights)}
        overridden={problems.some((p) => p.shortlist_overridden)}
        confirmedAt={ctx.company.shortlist_confirmed_at ? new Date(ctx.company.shortlist_confirmed_at).toISOString() : null}
        review={review ? { reviewedAt: new Date(review.reviewed_at).toISOString(), by: review.staff_name } : null}
        goldenHref={canOpenStage(ctx.event.current_stage, "golden") ? `/${ctx.event.slug}/${STAGE_INFO.golden.path}` : null}
        problemsHref={`/${ctx.event.slug}/${STAGE_INFO.problems.path}`}
      />
    </>
  );
}
