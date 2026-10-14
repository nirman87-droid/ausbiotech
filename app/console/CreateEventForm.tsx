"use client";

import { useActionState } from "react";
import { createEvent, type CreateEventState } from "@/lib/actions/console-events";

export function CreateEventForm() {
  const [state, action, pending] = useActionState<CreateEventState, FormData>(createEvent, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-3 sm:items-start">
      <div>
        <label htmlFor="ev-name" className="field-label">Event name</label>
        <input id="ev-name" name="name" className="input" required aria-invalid={e.name ? true : undefined} />
        {e.name && <span className="field-hint text-warning">{e.name}</span>}
      </div>
      <div>
        <label htmlFor="ev-slug" className="field-label">Web address</label>
        <input id="ev-slug" name="slug" className="input" required placeholder="for example, ausbiotech-2027"
          aria-invalid={e.slug ? true : undefined} />
        {e.slug && <span className="field-hint text-warning">{e.slug}</span>}
      </div>
      <div>
        <label htmlFor="ev-start" className="field-label">Starts (Brisbane time)</label>
        <input id="ev-start" name="starts_at" type="datetime-local" className="input" required aria-invalid={e.starts_at ? true : undefined} />
        {e.starts_at && <span className="field-hint text-warning">{e.starts_at}</span>}
      </div>
      <div className="sm:col-span-3">
        <button className="btn" type="submit" disabled={pending}>{pending ? "Creating" : "Create event"}</button>
      </div>
    </form>
  );
}
