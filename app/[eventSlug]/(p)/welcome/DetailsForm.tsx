"use client";

import { useState } from "react";
import { PLACEHOLDER_PREFIX, SECTORS, SIZE_BANDS, SIZE_BAND_LABELS, STATES } from "@/lib/copy";
import { AutoSelect, AutoText } from "@/components/participant/fields";

type Company = { name: string; website: string | null; sector: string | null; size_band: string | null; state: string | null };

// Your name and role, and your organisation's details with an Edit option.
// Every change is autosaved and written to the audit log.
export function DetailsForm({ company, name, role }: { company: Company; name: string; role: string | null }) {
  // Imported without an organisation: open the form and ask for the real name straight away.
  const placeholder = company.name.startsWith(PLACEHOLDER_PREFIX);
  const [editing, setEditing] = useState(placeholder);
  const set = (field: string) => (value: unknown) => ({ kind: "company.set", field, value });
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <AutoText
          opKey="person:name"
          server={name}
          toOp={(v) => ({ kind: "person.set", field: "name", value: v })}
          label="Your name"
          hint="Fix it here if we have it wrong."
          maxLength={120}
        />
        <AutoText
          opKey="person:role"
          server={role ?? ""}
          toOp={(v) => ({ kind: "person.set", field: "role", value: v })}
          label="Your role"
          maxLength={120}
        />
      </div>
      <section className="card p-4" aria-labelledby="company-title">
        <div className="flex items-center justify-between gap-2">
          <h2 id="company-title" className="text-lg font-semibold">
            Your organisation
          </h2>
          <button type="button" className="btn btn-secondary btn-small" aria-expanded={editing} onClick={() => setEditing(!editing)}>
            {editing ? "Done" : "Edit"}
          </button>
        </div>
        {placeholder && (
          <p className="notice notice-warning mt-3" role="status">
            We do not know which organisation you are from. Please type its name below.
          </p>
        )}
        {editing ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AutoText opKey="company:name" server={placeholder ? "" : company.name} toOp={set("name")} label="Organisation name" maxLength={120} />
            <AutoText opKey="company:website" server={company.website ?? ""} toOp={set("website")} label="Website" maxLength={200} />
            <AutoSelect opKey="company:sector" server={company.sector} toOp={set("sector")} label="Sector"
              options={SECTORS.map((s) => ({ value: s, label: s }))} />
            <AutoSelect opKey="company:size_band" server={company.size_band} toOp={set("size_band")} label="Number of staff"
              options={SIZE_BANDS.map((s) => ({ value: s, label: SIZE_BAND_LABELS[s] }))} />
            <AutoSelect opKey="company:state" server={company.state} toOp={set("state")} label="State"
              options={STATES.map((s) => ({ value: s, label: s }))} />
          </div>
        ) : (
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {[
              ["Organisation name", company.name],
              ["Website", company.website],
              ["Sector", company.sector],
              ["Number of staff", company.size_band ? SIZE_BAND_LABELS[company.size_band as keyof typeof SIZE_BAND_LABELS] : null],
              ["State", company.state],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-muted">{k}</dt>
                <dd className="font-medium text-ink">{v || "Not given"}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
