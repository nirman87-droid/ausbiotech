"use client";

import { useState, useTransition } from "react";
import { draftThemes, hubspotConfirm, hubspotPreview } from "@/lib/actions/console-insights";
import type { SyncPreview, SyncResult } from "@/lib/hubspot";

export function ThemesPanel({ slug, aiEnabled }: { slug: string; aiEnabled: boolean }) {
  const [pending, start] = useTransition();
  const [themes, setThemes] = useState<{ title: string; summary: string; companies: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card p-4" aria-labelledby="themes-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="themes-title" className="text-lg font-semibold">Common themes</h2>
        <span className="pill pill-warning">AI draft: needs review</span>
      </div>
      {!aiEnabled ? (
        <p className="mt-2 text-sm text-muted">Turn on AI helpers in Setup to draft common themes.</p>
      ) : (
        <>
          <button className="btn btn-secondary btn-small mt-3" disabled={pending}
            onClick={() => start(async () => { setError(null); const r = await draftThemes({ slug }); if (r.ok) setThemes(r.themes); else setError(r.error); })}>
            {pending ? "Drafting" : themes ? "Draft again" : "Draft common themes"}
          </button>
          <div aria-live="polite">
            {error && <p className="mt-2 text-sm text-warning">{error}</p>}
            {themes && (
              <ol className="mt-3 grid gap-3">
                {themes.map((t) => (
                  <li key={t.title}>
                    <p className="font-semibold text-ink">{t.title} <span className="font-normal text-muted">· about {t.companies} companies</span></p>
                    <p className="text-sm">{t.summary}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <p className="mt-3 text-xs text-muted">Company names are not sent. Check counts against the charts before sharing.</p>
        </>
      )}
    </section>
  );
}

export function HubspotPanel({ slug, isAdmin, lastRun }: { slug: string; isAdmin: boolean; lastRun: string | null }) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<{ logId: string; data: SyncPreview } | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!isAdmin) return <p className="text-sm text-muted">Only admins can sync to HubSpot.</p>;
  return (
    <div className="grid gap-3">
      <p className="text-sm">
        Companies become HubSpot companies. Only people who gave consent become contacts. The sync never runs on its own.
        {lastRun && <> Last run {lastRun}.</>}
      </p>
      <div>
        <button className="btn btn-secondary" disabled={pending}
          onClick={() => start(async () => {
            setError(null); setResult(null);
            const r = await hubspotPreview({ slug });
            if (r.ok) setPreview({ logId: r.logId, data: r.preview }); else setError(r.error);
          })}>
          {pending && !preview ? "Preparing" : "Preview sync"}
        </button>
      </div>
      {preview && !result && (
        <div className="card p-4">
          <h3 className="font-semibold">Preview</h3>
          <p className="mt-1 text-sm">
            {preview.data.totals.companies} companies, {preview.data.totals.contacts} contacts ({preview.data.totals.skippedNoConsent} people skipped: no consent),{" "}
            {preview.data.totals.notes} notes, {preview.data.totals.tasks} tasks.
          </p>
          <div className="mt-2 max-h-80 overflow-auto">
            <table className="table">
              <thead><tr><th scope="col">Company</th><th scope="col">Action</th><th scope="col">Contacts</th><th scope="col">Skipped</th><th scope="col">Note</th><th scope="col">Task</th><th scope="col">Lead status</th></tr></thead>
              <tbody>
                {preview.data.companies.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td><td>{c.action === "create" ? "Create or match by name" : "Update"}</td>
                    <td>{c.contacts}</td><td>{c.skipped}</td><td>{c.note ? "Yes" : ""}</td><td>{c.task ? "Yes" : ""}</td><td className="font-mono text-xs">{c.leadStatus ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.data.configured ? (
            <button className="btn mt-3" disabled={pending}
              onClick={() => window.confirm("Send this to HubSpot now?") && start(async () => {
                setError(null);
                const r = await hubspotConfirm({ slug, logId: preview.logId });
                if (r.ok) setResult(r.result); else setError(r.error);
              })}>
              {pending ? "Syncing" : "Confirm and sync"}
            </button>
          ) : (
            <p className="notice notice-warning mt-3 text-sm">HubSpot is not connected. Set HUBSPOT_PRIVATE_APP_TOKEN to enable the sync.</p>
          )}
        </div>
      )}
      <div aria-live="polite">
        {error && <p className="text-sm text-warning">{error}</p>}
        {result && (
          <div className={`notice ${result.errors.length ? "notice-warning" : "notice-success"}`}>
            <p>Synced {result.companies} companies, {result.contacts} contacts, {result.notes} notes and {result.tasks} tasks.</p>
            {result.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm">{result.errors.map((e) => <li key={e.company}>{e.company}: {e.error}</li>)}</ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
