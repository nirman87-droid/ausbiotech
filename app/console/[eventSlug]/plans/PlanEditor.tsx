"use client";

import { useEffect, useState, useTransition } from "react";
import { aiDraftPlan, markReady, resolveStaffSuggestion, savePlan, sendPlan } from "@/lib/actions/console-plans";
import { PLAN_STATUS_LABELS, type PlanStatus } from "@/lib/copy";

type Fields = { title: string; first_project: string; metric: string; baseline: string; target: string; recommendation: string; risks: string };
const LIMITS: Record<keyof Fields, number> = { title: 150, first_project: 1000, metric: 300, baseline: 200, target: 200, recommendation: 2500, risks: 1200 };
const LABELS: Record<keyof Fields, string> = {
  title: "Plan title",
  first_project: "First project",
  metric: "Measure",
  baseline: "Today (baseline)",
  target: "Target",
  recommendation: "Recommendation",
  risks: "Risks and how to manage them",
};

export function PlanEditor({
  slug,
  companyId,
  initial,
  status,
  version,
  aiEnabled,
  sentVersions,
  recipients,
}: {
  slug: string;
  companyId: string;
  initial: Fields;
  status: PlanStatus;
  version: number;
  aiEnabled: boolean;
  sentVersions: { version: number; sentAt: string; openedAt: string | null }[];
  recipients: number;
}) {
  const [fields, setFields] = useState<Fields>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [ai, setAi] = useState<{ id: string; fields: Record<string, string> } | null>(null);

  // A new company or a new saved version resets the editor.
  useEffect(() => {
    setFields(initial);
    setDirty(false);
  }, [companyId, version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (k: keyof Fields, v: string) => {
    setFields((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { text: r.message ?? "Done.", ok: true } : { text: r.error ?? "Something went wrong.", ok: false });
      if (r.ok) after?.();
    });
  const sent = status === "sent" || status === "opened";

  return (
    <section className="card grid gap-4 p-4" aria-labelledby="editor-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="editor-title" className="text-xl font-semibold">Final plan</h2>
        <span className="text-sm">
          Version {version} · <span className="pill">{PLAN_STATUS_LABELS[status]}</span>
        </span>
      </div>
      {sent && <p className="notice text-sm">This version has been sent. Saving changes creates version {version + 1}.</p>}
      {aiEnabled && (
        <div>
          <button className="btn btn-secondary btn-small" disabled={pending}
            onClick={() => start(async () => {
              setMsg(null);
              const r = await aiDraftPlan({ slug, companyId });
              if (r.ok) setAi({ id: r.id, fields: r.fields });
              else setMsg({ text: r.error, ok: false });
            })}>
            {pending && !ai ? "Drafting" : "Draft with AI from their answers"}
          </button>
        </div>
      )}
      {ai && (
        <div className="rounded-[10px] border border-teal bg-tint p-3" aria-label="AI draft">
          <p className="mono-label">AI draft. Read it carefully. It replaces what is in the editor if you use it.</p>
          <dl className="mt-2 grid gap-2 text-sm">
            {(Object.keys(LABELS) as (keyof Fields)[]).map((k) => (
              <div key={k}><dt className="font-semibold text-ink">{LABELS[k]}</dt><dd className="whitespace-pre-wrap">{ai.fields[k]}</dd></div>
            ))}
          </dl>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-small" onClick={() => {
              setFields((f) => ({ ...f, ...Object.fromEntries((Object.keys(LABELS) as (keyof Fields)[]).map((k) => [k, ai.fields[k] ?? f[k]])) }));
              setDirty(true);
              resolveStaffSuggestion({ id: ai.id, accepted: true });
              setAi(null);
            }}>Use this draft</button>
            <button className="btn btn-secondary btn-small" onClick={() => { resolveStaffSuggestion({ id: ai.id, accepted: false }); setAi(null); }}>Discard</button>
          </div>
        </div>
      )}
      {(Object.keys(LABELS) as (keyof Fields)[]).map((k) => {
        const id = `plan-${k}`;
        const long = k === "first_project" || k === "recommendation" || k === "risks";
        return (
          <div key={k}>
            <label htmlFor={id} className="field-label">{LABELS[k]}</label>
            {long ? (
              <textarea id={id} className="input" rows={k === "recommendation" ? 8 : 4} maxLength={LIMITS[k]} value={fields[k]} onChange={(e) => set(k, e.target.value)} />
            ) : (
              <input id={id} className="input" maxLength={LIMITS[k]} value={fields[k]} onChange={(e) => set(k, e.target.value)} />
            )}
            <span className="field-hint text-right font-mono text-xs">{fields[k].length}/{LIMITS[k]}</span>
          </div>
        );
      })}
      <p className="text-sm text-muted">Facilitator notes are never copied into the plan. Keep the plan to what the company can see.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending || !dirty} onClick={() => act(() => savePlan({ slug, companyId, fields }), () => setDirty(false))}>
          Save draft
        </button>
        <a className={`btn btn-secondary ${dirty ? "pointer-events-none opacity-60" : ""}`} aria-disabled={dirty}
          href={`/console/${slug}/plans/${companyId}/pdf`} target="_blank" rel="noreferrer">
          Preview PDF
        </a>
        <button className="btn btn-secondary" disabled={pending || dirty || sent || status === "ready"} onClick={() => act(() => markReady({ slug, companyId }))}>
          Mark ready
        </button>
        <button className="btn" disabled={pending || dirty || status !== "ready"}
          onClick={() => window.confirm(`Email a personal link to ${recipients} ${recipients === 1 ? "person" : "people"} at this company?`) && act(() => sendPlan({ slug, companyId }))}>
          Send to {recipients} {recipients === 1 ? "person" : "people"}
        </button>
      </div>
      <p role="status" aria-live="polite" className={`text-sm ${msg?.ok ? "text-success" : "text-warning"}`}>
        {msg?.text ?? (dirty ? "You have unsaved changes." : "")}
      </p>
      {sentVersions.length > 0 && (
        <div>
          <h3 className="font-semibold">Sent versions</h3>
          <ul className="mt-1 text-sm">
            {sentVersions.map((s) => (
              <li key={s.version}>
                Version {s.version}: sent {new Date(s.sentAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                {s.openedAt ? ", opened" : ", not opened yet"} ·{" "}
                <a className="link" href={`/console/${slug}/plans/${companyId}/pdf?version=${s.version}`} target="_blank" rel="noreferrer">PDF</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
