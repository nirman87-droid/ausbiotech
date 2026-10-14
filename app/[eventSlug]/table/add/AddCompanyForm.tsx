"use client";

import { useActionState } from "react";
import { SECTORS, SIZE_BANDS, SIZE_BAND_LABELS, STATES } from "@/lib/copy";
import { addWalkInCompany, type AddCompanyState } from "./actions";

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <span id={id} className="field-hint text-warning">
      {msg}
    </span>
  ) : null;
}

export function AddCompanyForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<AddCompanyState, FormData>(addWalkInCompany, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form action={action} className="mt-6 grid gap-5" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <div>
        <label htmlFor="name" className="field-label">
          Organisation name
        </label>
        <input id="name" name="name" className="input" defaultValue={v.name} required autoComplete="organization"
          aria-invalid={e.name ? true : undefined} aria-describedby={e.name ? "name-err" : undefined} />
        <Err id="name-err" msg={e.name} />
      </div>
      <div>
        <label htmlFor="sector" className="field-label">Sector</label>
        <select id="sector" name="sector" className="input" defaultValue={v.sector ?? ""} required
          aria-invalid={e.sector ? true : undefined} aria-describedby={e.sector ? "sector-err" : undefined}>
          <option value="">Choose one</option>
          {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Err id="sector-err" msg={e.sector} />
      </div>
      <div>
        <label htmlFor="size_band" className="field-label">Number of staff</label>
        <select id="size_band" name="size_band" className="input" defaultValue={v.size_band ?? ""} required
          aria-invalid={e.size_band ? true : undefined} aria-describedby={e.size_band ? "size-err" : undefined}>
          <option value="">Choose one</option>
          {SIZE_BANDS.map((s) => <option key={s} value={s}>{SIZE_BAND_LABELS[s]}</option>)}
        </select>
        <Err id="size-err" msg={e.size_band} />
      </div>
      <div>
        <label htmlFor="state" className="field-label">State</label>
        <select id="state" name="state" className="input" defaultValue={v.state ?? ""} required
          aria-invalid={e.state ? true : undefined} aria-describedby={e.state ? "state-err" : undefined}>
          <option value="">Choose one</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Err id="state-err" msg={e.state} />
      </div>
      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Adding" : "Add my organisation"}
        </button>
      </div>
    </form>
  );
}
