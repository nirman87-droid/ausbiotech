import Link from "next/link";
import { STAGE_INFO, type Stage } from "./copy";
import { canOpenStage } from "./rules";
import type { Participant } from "./session";

// Returns a "not open yet" panel when the page's stage is later than the current stage.
export function stageGate(ctx: Participant, stage: Stage) {
  const current = ctx.event.current_stage;
  if (canOpenStage(current, stage)) return null;
  return (
    <section className="card mx-auto max-w-xl p-6 text-center" aria-labelledby="locked-title">
      <h1 id="locked-title" className="text-2xl font-semibold">
        {STAGE_INFO[stage].label} is not open yet
      </h1>
      <p className="mt-2">Your facilitator will open this stage for everyone. This page will update by itself.</p>
      <p className="mt-4">
        <Link className="btn" href={`/${ctx.event.slug}/${STAGE_INFO[current].path}`}>
          Go to {STAGE_INFO[current].label}
        </Link>
      </p>
    </section>
  );
}

export function PageTitle({ step, title, intro }: { step: string; title: string; intro?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mono-label">{step}</p>
      <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
      {intro && <div className="mt-2 max-w-3xl text-lg">{intro}</div>}
    </div>
  );
}
