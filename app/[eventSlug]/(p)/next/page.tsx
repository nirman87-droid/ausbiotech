import type { Metadata } from "next";
import { requireParticipant } from "@/lib/session";
import { nextStepsForCompany } from "@/lib/queries";
import { PageTitle, stageGate } from "@/lib/stage-gate";
import { STAGE_INFO } from "@/lib/copy";
import { NextStepsForm } from "./NextStepsForm";

export const metadata: Metadata = { title: "Next steps" };

// P7: what happens next, and consent to be contacted.
export default async function NextPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const ctx = await requireParticipant(eventSlug);
  const gate = stageGate(ctx, "next_steps");
  if (gate) return gate;
  const next = await nextStepsForCompany(ctx.company.id);
  return (
    <>
      <PageTitle step="Step 6" title="Next steps" intro="Tell us what would help most. Everyone gets their AI starter plan." />
      <NextStepsForm
        choice={next?.choice ?? null}
        startTiming={next?.start_timing ?? null}
        extraContact={next?.extra_contact ?? null}
        consent={ctx.person.marketing_consent}
        submittedAt={next?.submitted_at ? new Date(next.submitted_at).toISOString() : null}
        doneHref={`/${ctx.event.slug}/${STAGE_INFO.done.path}`}
      />
    </>
  );
}
