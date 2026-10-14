import type { Metadata } from "next";
import { requireParticipant } from "@/lib/session";
import { goldenDraftsForCompany, problemsForCompany } from "@/lib/queries";
import { PageTitle, stageGate } from "@/lib/stage-gate";
import { STAGE_INFO } from "@/lib/copy";
import { canOpenStage, rankProblems } from "@/lib/rules";
import { GoldenBoard } from "./GoldenBoard";

export const metadata: Metadata = { title: "Golden use case" };

// P6: turn one shortlisted problem into a golden use case draft.
export default async function GoldenPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const ctx = await requireParticipant(eventSlug);
  const gate = stageGate(ctx, "golden");
  if (gate) return gate;
  const [problems, drafts] = await Promise.all([problemsForCompany(ctx.company.id), goldenDraftsForCompany(ctx.company.id)]);
  const shortlisted = rankProblems(problems.filter((p) => p.shortlisted));
  return (
    <>
      <PageTitle
        step="Step 5"
        title="Golden use case"
        intro="Pick one problem and shape it into a first project you could start soon."
      />
      <GoldenBoard
        problems={shortlisted.map((p) => ({ id: p.id, title: p.title }))}
        drafts={Object.fromEntries(
          drafts.map((d) => [
            d.problem_id,
            {
              first_project: d.first_project,
              metric: d.metric,
              baseline: d.baseline,
              target: d.target,
              data_location: d.data_location,
              sample_access: d.sample_access,
              approval_level: d.approval_level,
              owner: d.owner,
              check_mvp: d.check_mvp,
              check_collab: d.check_collab,
              check_metric: d.check_metric,
              check_data: d.check_data,
            },
          ]),
        )}
        selectedId={ctx.company.golden_problem_id}
        aiEnabled={ctx.event.ai_enabled}
        nextHref={canOpenStage(ctx.event.current_stage, "next_steps") ? `/${ctx.event.slug}/${STAGE_INFO.next_steps.path}` : null}
        shortlistHref={`/${ctx.event.slug}/${STAGE_INFO.shortlist.path}`}
      />
    </>
  );
}
