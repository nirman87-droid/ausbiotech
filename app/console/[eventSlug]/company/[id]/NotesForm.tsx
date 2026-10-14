"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getSaveQueue } from "@/lib/client/save-queue";

type Notes = {
  decision_maker: string | null;
  lead_rating: string | null;
  funding_fit: string | null;
  signals: string | null;
  notes: string | null;
  next_action: string | null;
  action_owner: string | null;
  action_due: string | null;
};

// Facilitator notes for one company, saved automatically. Private to the ARM Hub team.
export function NotesForm({
  companyId,
  initial,
  lastEdited,
}: {
  companyId: string;
  initial: Notes;
  lastEdited: { by: string | null; at: string | null };
}) {
  const router = useRouter();
  const queue = useMemo(() => getSaveQueue(`notes-${companyId}`, "/api/console/notes"), [companyId]);
  const status = useSyncExternalStore(queue.subscribe, queue.getStatus, () => "saved" as const);
  const [values, setValues] = useState<Notes>(() => {
    const v = { ...initial };
    for (const k of Object.keys(v) as (keyof Notes)[]) {
      const p = queue.pendingValue(`notes:${k}`);
      if (p && "value" in p) (v as Record<string, unknown>)[k] = p.value;
    }
    return v;
  });
  const focused = useRef<keyof Notes | null>(null);

  // Take in edits from other staff, except on the field this person is typing in.
  useEffect(() => {
    setValues((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(initial) as (keyof Notes)[]) {
        if (focused.current !== k && !queue.isPending(`notes:${k}`)) (next as Record<string, unknown>)[k] = initial[k];
      }
      return next;
    });
  }, [initial, queue]);

  useEffect(() => {
    const off = queue.onSaved(() => router.refresh());
    return () => {
      off();
    };
  }, [queue, router]);

  const set = (k: keyof Notes, v: string | null, immediate = false) => {
    setValues((cur) => ({ ...cur, [k]: v }));
    queue.set(`notes:${k}`, { kind: "notes.set", companyId, field: k, value: v }, immediate);
  };
  const bind = (k: keyof Notes) => ({
    value: values[k] ?? "",
    onFocus: () => (focused.current = k),
    onBlur: () => (focused.current = null),
  });

  const radios = (k: "decision_maker" | "lead_rating", label: string, opts: [string, string][]) => (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {opts.map(([v, l]) => (
          <label key={v} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[8px] border px-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal ${values[k] === v ? "border-teal bg-tint" : "border-input"}`}>
            <input type="radio" name={`${k}-${companyId}`} value={v} checked={values[k] === v} onChange={() => set(k, v, true)} className="h-4 w-4 accent-teal" />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <section className="card grid gap-4 p-4" aria-labelledby="notes-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="notes-title" className="text-xl font-semibold">Facilitator notes</h2>
        <span role="status" aria-live="polite" className={`text-sm ${status === "saved" ? "text-success" : status === "saving" ? "text-muted" : "text-warning"}`}>
          {status === "saved" ? "All changes saved" : status === "saving" ? "Saving" : status === "ended" ? "Sign in again to save" : "Offline. Will retry."}
        </span>
      </div>
      <p className="text-sm text-muted">
        Private to the ARM Hub team. Never shown to the company or copied into the plan.
        {lastEdited.by && <> Last edited by {lastEdited.by}{lastEdited.at ? ` at ${new Date(lastEdited.at).toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", minute: "2-digit" })}` : ""}.</>}
      </p>
      {radios("decision_maker", "Decision maker in the room?", [["yes", "Yes"], ["no", "No"], ["unsure", "Unsure"]])}
      {radios("lead_rating", "Lead rating", [["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"]])}
      <div>
        <label htmlFor="n-funding" className="field-label">AI Adopt funding fit</label>
        <input id="n-funding" className="input" maxLength={300} {...bind("funding_fit")} onChange={(e) => set("funding_fit", e.target.value)} />
      </div>
      <div>
        <label htmlFor="n-signals" className="field-label">Buying signals</label>
        <textarea id="n-signals" className="input" maxLength={2000} {...bind("signals")} onChange={(e) => set("signals", e.target.value)} />
      </div>
      <div>
        <label htmlFor="n-notes" className="field-label">Notes</label>
        <textarea id="n-notes" className="input" rows={6} maxLength={5000} {...bind("notes")} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label htmlFor="n-action" className="field-label">Next action</label>
          <input id="n-action" className="input" maxLength={500} {...bind("next_action")} onChange={(e) => set("next_action", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="n-owner" className="field-label">Action owner</label>
          <input id="n-owner" className="input" maxLength={120} {...bind("action_owner")} onChange={(e) => set("action_owner", e.target.value)} />
        </div>
        <div>
          <label htmlFor="n-due" className="field-label">Due</label>
          <input id="n-due" type="date" className="input" {...bind("action_due")} onChange={(e) => set("action_due", e.target.value, true)} />
        </div>
      </div>
    </section>
  );
}
