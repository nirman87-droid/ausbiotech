import { requireParticipant } from "@/lib/session";
import { editingMarkers } from "@/lib/queries";
import { isEditingLocked } from "@/lib/rules";
import { topics } from "@/lib/topics";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ParticipantProvider } from "@/components/participant/ParticipantProvider";
import { ParticipantHeader, StageBanner, Stepper } from "@/components/participant/Shell";

// Shared layout for every participant stage page: header, stage stepper, live updates.
export default async function ParticipantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ctx = await requireParticipant(eventSlug);
  const markers = await editingMarkers(ctx.company.id, ctx.person.id);
  const locked = isEditingLocked(ctx.event, ctx.company);
  const e = ctx.event;
  return (
    <ParticipantProvider
      slug={e.slug}
      companyId={ctx.company.id}
      personId={ctx.person.id}
      locked={locked}
      markers={markers}
    >
      <LiveRefresh topics={[topics.event(e.id), topics.company(ctx.company.id)]} />
      <ParticipantHeader companyName={ctx.company.name} tableNumber={ctx.table?.number ?? null} personName={ctx.person.name} />
      <Stepper
        slug={e.slug}
        current={e.current_stage}
        timer={{
          endsAt: e.timer_ends_at ? new Date(e.timer_ends_at).toISOString() : null,
          pausedRemaining: e.timer_paused_remaining_s,
          serverNow: Date.now(),
        }}
      />
      <StageBanner slug={e.slug} current={e.current_stage} />
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        {locked && (
          <p className="notice notice-warning mb-6" role="status">
            Editing is closed. You can still read your answers.
          </p>
        )}
        {children}
      </main>
    </ParticipantProvider>
  );
}
