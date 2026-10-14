"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveCompany } from "@/lib/console-queries";
import { minutesAgo } from "@/lib/format";

const FLAGS: Record<string, { label: string; cls: string }> = {
  org_to_confirm: { label: "Organisation to confirm", cls: "pill-warning" },
  stuck: { label: "Stuck", cls: "pill-warning" },
  over_200: { label: "Over 200 staff", cls: "pill-warning" },
  size_missing: { label: "Size missing", cls: "pill-warning" },
  no_table: { label: "No table", cls: "pill-warning" },
  locked: { label: "Locked", cls: "" },
  duplicate_session: { label: "Second device", cls: "pill-warning" },
  walk_in: { label: "Walk-in", cls: "pill-teal" },
};
const STEPS = ["Signed in", "Poll", "Problems", "Shortlist", "Golden", "Next steps"];

export function CompanyTable({
  slug,
  companies,
  staffId,
  isFacilitator,
  serverNow,
}: {
  slug: string;
  companies: LiveCompany[];
  staffId: string;
  isFacilitator: boolean;
  serverNow: number;
}) {
  const hasMine = companies.some((c) => c.facilitator_id === staffId);
  const [mine, setMine] = useState(isFacilitator && hasMine);
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const rows = mine ? companies.filter((c) => c.facilitator_id === staffId) : companies;

  return (
    <section aria-labelledby="companies-title" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="companies-title" className="text-xl font-semibold">Companies</h2>
        <div className="flex items-center gap-2">
          <input id="mine" type="checkbox" className="h-5 w-5 accent-teal" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          <label htmlFor="mine">Only my tables</label>
        </div>
      </div>
      <div className="relative mt-3 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Table</th>
              <th scope="col">Company</th>
              <th scope="col">Sector</th>
              <th scope="col">Progress</th>
              <th scope="col">Problems</th>
              <th scope="col">Last activity</th>
              <th scope="col">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const done = [c.signed_in > 0, c.poll_done, c.valid_problems > 0, c.shortlist_confirmed, c.golden_ready, c.next_submitted];
              return (
                <tr key={c.id}>
                  <td className="font-mono">{c.table_number ?? "None"}</td>
                  <td>
                    <Link className="link font-semibold" href={`/console/${slug}/company/${c.id}`}>{c.name}</Link>
                    <span className="block text-xs text-muted">{c.signed_in} of {c.people} signed in</span>
                  </td>
                  <td className="text-sm">{c.sector ?? ""}</td>
                  <td>
                    <span className="sr-only">{c.progress} of 6 steps done: {STEPS.filter((_, i) => done[i]).join(", ") || "none"}</span>
                    <span className="flex gap-0.5" aria-hidden="true">
                      {done.map((d, i) => (
                        <span key={i} title={STEPS[i]} className={`h-3 w-5 rounded-sm ${d ? "bg-teal" : "bg-line"}`} />
                      ))}
                    </span>
                    <span className="mt-1 block text-xs text-muted" aria-hidden="true">{c.progress}/6</span>
                  </td>
                  <td className="font-mono">{c.problems}</td>
                  <td className="whitespace-nowrap text-sm">{minutesAgo(c.last_activity_at, now)}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {c.reviewed && <span className="pill pill-success">Reviewed</span>}
                      {c.flags.map((f) => (
                        <span key={f} className={`pill ${FLAGS[f]?.cls ?? ""}`}>{FLAGS[f]?.label ?? f}</span>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-muted">No companies to show.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
