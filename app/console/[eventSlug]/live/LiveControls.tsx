"use client";

import { useState, useTransition } from "react";
import { STAGES, STAGE_INFO, type Stage } from "@/lib/copy";
import { eventControl } from "@/lib/actions/console-live";
import { Timer } from "@/components/Timer";

export function LiveControls({
  slug,
  stage,
  timer,
  pollOpen,
}: {
  slug: string;
  stage: Stage;
  timer: { endsAt: string | null; pausedRemaining: number | null; serverNow: number };
  pollOpen: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(15);
  const [chosen, setChosen] = useState<Stage>(stage);
  const run = (input: Record<string, unknown>) =>
    start(async () => {
      setError(null);
      const r = await eventControl({ slug, ...input });
      if (!r.ok) setError(r.error);
    });
  const running = Boolean(timer.endsAt);
  const paused = timer.pausedRemaining != null;
  const isLast = stage === "done";

  return (
    <section className="card grid gap-5 p-4 lg:grid-cols-[1.2fr_1fr_auto]" aria-label="Room controls">
      <div>
        <p className="mono-label">Current stage</p>
        <p className="text-2xl font-semibold text-ink">{STAGE_INFO[stage].label}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="stage-select" className="field-label text-sm">Jump to stage</label>
            <select id="stage-select" className="input" value={chosen} onChange={(e) => setChosen(e.target.value as Stage)}>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_INFO[s].label}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" disabled={pending || chosen === stage}
            onClick={() => {
              if (window.confirm(`Move everyone to "${STAGE_INFO[chosen].label}"?`)) run({ action: "set_stage", stage: chosen });
            }}>
            Set stage
          </button>
        </div>
        <button className="btn mt-3" disabled={pending || isLast} onClick={() => run({ action: "next_stage" })}>
          {isLast ? "All stages open" : `Open next stage for everyone: ${STAGE_INFO[STAGES[STAGES.indexOf(stage) + 1]].label}`}
        </button>
      </div>

      <div>
        <p className="mono-label">Phase timer</p>
        <div className="min-h-[40px]">
          {running || paused ? (
            <Timer endsAt={timer.endsAt} pausedRemaining={timer.pausedRemaining} serverNow={timer.serverNow} big />
          ) : (
            <p className="text-muted">No timer running</p>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="timer-min" className="field-label text-sm">Minutes</label>
            <input id="timer-min" type="number" min={1} max={180} className="input w-24" value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))} />
          </div>
          <button className="btn btn-secondary" disabled={pending || minutes < 1} onClick={() => run({ action: "timer_start", minutes })}>
            Start
          </button>
          {running && <button className="btn btn-secondary" disabled={pending} onClick={() => run({ action: "timer_pause" })}>Pause</button>}
          {paused && <button className="btn btn-secondary" disabled={pending} onClick={() => run({ action: "timer_resume" })}>Resume</button>}
          {(running || paused) && (
            <>
              <button className="btn btn-secondary" disabled={pending} onClick={() => run({ action: "timer_add", minutes: 5 })}>Add 5 minutes</button>
              <button className="btn btn-secondary" disabled={pending} onClick={() => run({ action: "timer_clear" })}>Clear</button>
            </>
          )}
        </div>
      </div>

      <div>
        <p className="mono-label">Poll</p>
        <p className="font-semibold text-ink">{pollOpen ? "Open" : "Closed"}</p>
        <button className="btn btn-secondary mt-2" disabled={pending} onClick={() => run({ action: "poll_open", open: !pollOpen })}>
          {pollOpen ? "Close poll" : "Open poll"}
        </button>
      </div>
      <div aria-live="polite" className="lg:col-span-3">
        {error && <p className="text-warning">{error}</p>}
      </div>
    </section>
  );
}
