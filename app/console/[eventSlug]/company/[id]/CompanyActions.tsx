"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markShortlistReviewed, mergeCompanies } from "@/lib/actions/console-company";

export function ReviewButton({ slug, companyId, reviewed }: { slug: string; companyId: string; reviewed: string | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn" disabled={pending}
        onClick={() => start(async () => { const r = await markShortlistReviewed({ slug, companyId }); setMsg(r.ok ? (r.message ?? null) : r.error); })}>
        {reviewed ? "Mark as reviewed again" : "Mark shortlist as expert reviewed"}
      </button>
      <span role="status" aria-live="polite" className="text-sm">{msg ?? (reviewed ? `Reviewed ${reviewed}` : "")}</span>
    </div>
  );
}

export function MergePanel({ slug, companyId, others }: { slug: string; companyId: string; others: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [source, setSource] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const name = others.find((o) => o.id === source)?.name;
  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-semibold text-teal">Merge a duplicate company into this one</summary>
      <p className="mt-2 text-sm">People, problems and drafts move here. The duplicate is then deleted. This cannot be undone.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="merge-src" className="field-label text-sm">Duplicate company</label>
          <select id="merge-src" className="input" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choose one</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <button className="btn btn-danger" disabled={!source || pending}
          onClick={() => {
            if (!window.confirm(`Merge "${name}" into this company and delete "${name}"?`)) return;
            start(async () => {
              const r = await mergeCompanies({ slug, targetId: companyId, sourceId: source });
              setMsg(r.ok ? { text: r.message ?? "Merged.", ok: true } : { text: r.error, ok: false });
              if (r.ok) { setSource(""); router.refresh(); }
            });
          }}>
          Merge
        </button>
      </div>
      <p role="status" aria-live="polite" className={`mt-2 text-sm ${msg?.ok ? "text-success" : "text-warning"}`}>{msg?.text}</p>
    </details>
  );
}
