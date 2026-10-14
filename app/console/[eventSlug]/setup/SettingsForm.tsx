"use client";

import { useActionState } from "react";
import { saveSettings, type ActionResult } from "@/lib/actions/console-setup";

type Props = {
  slug: string;
  values: {
    name: string;
    venue: string;
    starts_at: string;
    access_opens_at: string;
    access_closes_at: string;
    plans_due_date: string;
    booking_url: string;
    ai_enabled: boolean;
    weights: { ready: number; value: number; foundation: number };
    stuck_threshold_min: number;
    status: string;
  };
};

export function SettingsForm({ slug, values: v }: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveSettings, null);
  const field = (id: string, label: string, input: React.ReactNode, hint?: string) => (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {input}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-4 md:grid-cols-2">
        {field("name", "Event name", <input id="name" name="name" className="input" defaultValue={v.name} required />)}
        {field("venue", "Venue", <input id="venue" name="venue" className="input" defaultValue={v.venue} />)}
        {field("starts_at", "Starts (Brisbane time)", <input id="starts_at" name="starts_at" type="datetime-local" className="input" defaultValue={v.starts_at} />)}
        {field("plans_due_date", "Plans due date", <input id="plans_due_date" name="plans_due_date" type="date" className="input" defaultValue={v.plans_due_date} />, "Shown to participants on the thank you page.")}
        {field("access_opens_at", "Access opens", <input id="access_opens_at" name="access_opens_at" type="datetime-local" className="input" defaultValue={v.access_opens_at} />)}
        {field("access_closes_at", "Access closes", <input id="access_closes_at" name="access_closes_at" type="datetime-local" className="input" defaultValue={v.access_closes_at} />, "After this, editing locks and only personal links work.")}
        {field("booking_url", "Booking link for follow-ups", <input id="booking_url" name="booking_url" type="url" className="input" defaultValue={v.booking_url} placeholder="https://" />, "Used by the Book a follow-up button on the final plan.")}
        {field("status", "Event status", (
          <select id="status" name="status" className="input" defaultValue={v.status}>
            <option value="setup">Setup</option>
            <option value="live">Live</option>
            <option value="closed">Closed (locks all editing)</option>
          </select>
        ))}
      </div>
      <fieldset className="card p-4">
        <legend className="px-1 font-semibold text-ink">Score weights</legend>
        <p className="text-sm text-muted">Score = data ready / 5 × ready weight + value / 5 × value weight + foundation weight if ticked.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          {field("weight_ready", "Data ready", <input id="weight_ready" name="weight_ready" type="number" min={0} max={100} className="input" defaultValue={v.weights.ready} />)}
          {field("weight_value", "Value", <input id="weight_value" name="weight_value" type="number" min={0} max={100} className="input" defaultValue={v.weights.value} />)}
          {field("weight_foundation", "Foundation", <input id="weight_foundation" name="weight_foundation" type="number" min={0} max={100} className="input" defaultValue={v.weights.foundation} />)}
          {field("stuck_threshold_min", "Stuck after (minutes)", <input id="stuck_threshold_min" name="stuck_threshold_min" type="number" min={1} max={120} className="input" defaultValue={v.stuck_threshold_min} />)}
        </div>
      </fieldset>
      <div className="flex items-start gap-3">
        <input id="ai_enabled" name="ai_enabled" type="checkbox" className="mt-0.5 h-6 w-6 accent-teal" defaultChecked={v.ai_enabled} aria-describedby="ai-hint" />
        <div>
          <label htmlFor="ai_enabled" className="font-semibold text-ink">Turn on AI helpers for this event</label>
          <p id="ai-hint" className="field-hint">
            Off by default. When on, workshop text is sent to the Anthropic API, which is hosted outside Australia. Only turn on with ARM Hub approval.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" type="submit" disabled={pending}>{pending ? "Saving" : "Save settings"}</button>
        <span role="status" aria-live="polite">
          {state && (state.ok ? <span className="text-success">{state.message}</span> : <span className="text-warning">{state.error}</span>)}
        </span>
      </div>
    </form>
  );
}
