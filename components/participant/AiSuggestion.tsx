"use client";

import { useState, useTransition } from "react";
import { requestSuggestion, resolveSuggestion } from "@/lib/actions/participant-ai";

const FIELD_LABELS: Record<string, string> = {
  title: "Problem",
  today_state: "What happens today",
  future_state: "What good would look like",
  metric: "Measure",
  baseline: "Baseline",
  target: "Target",
};

// Asks the AI helper for a suggestion and shows it next to the user's own words.
// Nothing changes until the person presses "Use this".
export function AiSuggestion({
  kind,
  problemId,
  buttonLabel,
  onAccept,
}: {
  kind: "sharpen" | "measure";
  problemId: string;
  buttonLabel: string;
  onAccept: (s: Record<string, string>) => void;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ id: string; suggestion: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = () =>
    start(async () => {
      setError(null);
      const r = await requestSuggestion({ kind, problemId });
      if (r.ok) setResult({ id: r.id, suggestion: r.suggestion });
      else setError(r.error);
    });

  const close = (accepted: boolean) => {
    if (!result) return;
    if (accepted) onAccept(result.suggestion);
    resolveSuggestion({ id: result.id, accepted });
    setResult(null);
  };

  return (
    <div>
      {!result && (
        <button type="button" className="btn btn-secondary btn-small" onClick={ask} disabled={pending}>
          {pending ? "Thinking" : buttonLabel}
        </button>
      )}
      <div aria-live="polite">
        {error && <p className="mt-2 text-sm text-warning">{error}</p>}
        {result && (
          <section className="mt-2 rounded-[10px] border border-teal bg-tint p-4" aria-label="AI suggestion">
            <p className="mono-label">Suggestion from the AI helper. Check it before you use it.</p>
            <dl className="mt-2 grid gap-2">
              {Object.entries(result.suggestion).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm font-semibold text-ink">{FIELD_LABELS[k] ?? k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-small" onClick={() => close(true)}>
                Use this
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => close(false)}>
                Keep mine
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
