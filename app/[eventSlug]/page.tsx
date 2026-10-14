import { redirect } from "next/navigation";
import { getParticipant } from "@/lib/session";
import { STAGE_INFO } from "@/lib/copy";

// The event address on its own sends a signed-in participant to the current stage.
export default async function EventHome({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const ctx = await getParticipant(eventSlug);
  if (!ctx) redirect(`/${eventSlug}/no-access`);
  redirect(`/${eventSlug}/${STAGE_INFO[ctx.event.current_stage].path}`);
}
