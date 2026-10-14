"use client";

import Papa from "papaparse";
import { useState, useTransition } from "react";
import {
  addStaff,
  addTables,
  deletePerson,
  deleteQuestion,
  importRegistrations,
  moveQuestion,
  removeStaff,
  revokeSession,
  rotateTableToken,
  saveQuestion,
  setCompanyLocked,
  setCompanyTable,
  setTableFacilitator,
  type ActionResult,
} from "@/lib/actions/console-setup";
import { SIZE_BAND_LABELS, type SizeBand } from "@/lib/copy";

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setMsg(null);
      try {
        const r = await fn();
        setMsg(r.ok ? (r.message ? { text: r.message, ok: true } : null) : { text: r.error, ok: false });
      } catch {
        setMsg({ text: "Something went wrong. Try again.", ok: false });
      }
    });
  const status = (
    <span role="status" aria-live="polite" className="text-sm">
      {msg && <span className={msg.ok ? "text-success" : "text-warning"}>{msg.text}</span>}
    </span>
  );
  return { pending, run, status };
}

// Poll questions ------------------------------------------------------------------

type Question = { id: string; text: string; type: "single" | "scale"; options: string[]; responses: number };

function QuestionEditor({ slug, q, onDone }: { slug: string; q?: Question; onDone: () => void }) {
  const { pending, run, status } = useRun();
  const [text, setText] = useState(q?.text ?? "");
  const [type, setType] = useState<"single" | "scale">(q?.type ?? "single");
  const [options, setOptions] = useState((q?.options ?? []).join("\n"));
  const idp = q?.id ?? "new";
  return (
    <div className="grid gap-3 rounded-[10px] border border-line p-3">
      <div>
        <label htmlFor={`qt-${idp}`} className="field-label">Question</label>
        <input id={`qt-${idp}`} className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div>
          <label htmlFor={`qy-${idp}`} className="field-label">Type</label>
          <select id={`qy-${idp}`} className="input" value={type} onChange={(e) => setType(e.target.value as "single" | "scale")}>
            <option value="single">Pick one option</option>
            <option value="scale">1 to 5 scale</option>
          </select>
        </div>
        {type === "single" && (
          <div>
            <label htmlFor={`qo-${idp}`} className="field-label">Options, one per line</label>
            <textarea id={`qo-${idp}`} className="input" rows={4} value={options} onChange={(e) => setOptions(e.target.value)} />
          </div>
        )}
      </div>
      {q && q.responses > 0 && (
        <p className="text-sm text-warning">{q.responses} people have answered. Removing an option deletes the answers that chose it.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-small" disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await saveQuestion({ slug, id: q?.id, text, type, options: type === "scale" ? ["1", "2", "3", "4", "5"] : options.split("\n").map((o) => o.trim()).filter(Boolean) });
              if (r.ok) onDone();
              return r;
            })
          }>
          Save question
        </button>
        <button className="btn btn-secondary btn-small" onClick={onDone}>Cancel</button>
        {status}
      </div>
    </div>
  );
}

export function PollEditor({ slug, questions }: { slug: string; questions: Question[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const { pending, run, status } = useRun();
  return (
    <div className="grid gap-3">
      <ol className="grid gap-2">
        {questions.map((q, i) =>
          editing === q.id ? (
            <li key={q.id}><QuestionEditor slug={slug} q={q} onDone={() => setEditing(null)} /></li>
          ) : (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line p-3">
              <div>
                <p className="font-medium text-ink">{i + 1}. {q.text}</p>
                <p className="text-sm text-muted">
                  {q.type === "scale" ? "1 to 5 scale" : q.options.join(" · ")} · {q.responses} answers
                </p>
              </div>
              <div className="flex gap-1">
                <button className="btn btn-secondary btn-small" disabled={pending || i === 0} aria-label={`Move question ${i + 1} up`}
                  onClick={() => run(() => moveQuestion({ slug, id: q.id, direction: "up" }))}>Up</button>
                <button className="btn btn-secondary btn-small" disabled={pending || i === questions.length - 1} aria-label={`Move question ${i + 1} down`}
                  onClick={() => run(() => moveQuestion({ slug, id: q.id, direction: "down" }))}>Down</button>
                <button className="btn btn-secondary btn-small" onClick={() => setEditing(q.id)}>Edit</button>
                <button className="btn btn-danger btn-small" disabled={pending}
                  onClick={() => window.confirm(`Delete "${q.text}" and its answers?`) && run(() => deleteQuestion({ slug, id: q.id }))}>
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ol>
      {editing === "new" ? (
        <QuestionEditor slug={slug} onDone={() => setEditing(null)} />
      ) : (
        <div><button className="btn btn-secondary" onClick={() => setEditing("new")}>Add a question</button></div>
      )}
      {status}
    </div>
  );
}

// Tables ------------------------------------------------------------------------

type Table = { id: string; number: number; table_token: string; facilitator_id: string | null; companies: number };
type Staff = { id: string; name: string; email: string; role: string };

export function TablesPanel({ slug, tables, staff, origin }: { slug: string; tables: Table[]; staff: Staff[]; origin: string }) {
  const { pending, run, status } = useRun();
  const [count, setCount] = useState(6);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="table-count" className="field-label">Add tables</label>
          <input id="table-count" type="number" min={1} max={40} className="input w-24" value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </div>
        <button className="btn btn-secondary" disabled={pending} onClick={() => run(() => addTables({ slug, count }))}>Add</button>
        <a className="btn" href={`/console/${slug}/table-cards`} target="_blank" rel="noreferrer">Print table cards (PDF)</a>
        {status}
      </div>
      <div className="relative overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th scope="col">Table</th><th scope="col">Companies</th><th scope="col">Facilitator</th><th scope="col">QR link</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {tables.map((t) => {
              const url = `${origin}/${slug}/t/${t.table_token}`;
              return (
                <tr key={t.id}>
                  <td className="font-mono">{t.number}</td>
                  <td>{t.companies}</td>
                  <td>
                    <label htmlFor={`fac-${t.id}`} className="sr-only">Facilitator for table {t.number}</label>
                    <select id={`fac-${t.id}`} className="input" value={t.facilitator_id ?? ""} disabled={pending}
                      onChange={(e) => run(() => setTableFacilitator({ slug, tableId: t.id, facilitatorId: e.target.value || null }))}>
                      <option value="">None</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="max-w-[260px]">
                    <a className="link break-all font-mono text-xs" href={url} target="_blank" rel="noreferrer">{url}</a>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-small" disabled={pending}
                      onClick={() => window.confirm(`Make a new QR code for table ${t.number}? The old code stops working.`) && run(() => rotateTableToken({ slug, tableId: t.id }))}>
                      New code
                    </button>
                  </td>
                </tr>
              );
            })}
            {tables.length === 0 && <tr><td colSpan={5} className="text-muted">No tables yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// CSV import with a column mapping step ---------------------------------------

const TARGETS = [
  { key: "company_name", label: "Company name", required: true, guess: /company|organi[sz]ation|business/i },
  { key: "person_name", label: "Person name", guess: /^(full )?name$|attendee|person|contact name/i },
  { key: "email", label: "Email", guess: /e-?mail/i },
  { key: "role", label: "Role or job title", guess: /role|title|position/i },
  { key: "website", label: "Website", guess: /web|url|domain/i },
  { key: "sector", label: "Sector", guess: /sector|industry/i },
  { key: "size_band", label: "Number of staff", guess: /size|staff|employee|headcount/i },
  { key: "state", label: "State", guess: /state|region/i },
  { key: "table_number", label: "Table number", guess: /table/i },
] as const;

export function CsvImport({ slug }: { slug: string }) {
  const { pending, run, status } = useRun();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);

  function onFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (hs.length === 0) {
          setFileError("We could not find a header row in that file.");
          return;
        }
        setHeaders(hs);
        setRows(res.data);
        const guess: Record<string, string> = {};
        for (const t of TARGETS) {
          const h = hs.find((x) => t.guess.test(x) && !Object.values(guess).includes(x));
          if (h) guess[t.key] = h;
        }
        setMap(guess);
      },
      error: () => setFileError("We could not read that file. Save it as CSV and try again."),
    });
  }

  const mapped = rows
    .map((r) => Object.fromEntries(TARGETS.map((t) => [t.key, map[t.key] ? String(r[map[t.key]] ?? "").trim() : ""])))
    // Rows without a company still count when they name a person: they get a placeholder organisation.
    .filter((r) => r.company_name || r.person_name || r.email);

  return (
    <div className="grid gap-4">
      <div>
        <label htmlFor="csv" className="field-label">Registrations CSV</label>
        <input id="csv" type="file" accept=".csv,text/csv" className="input" onChange={(e) => onFile(e.target.files?.[0])} />
        <span className="field-hint">Re-importing is safe. Companies match by name and people match by email.</span>
        {fileError && <p className="mt-1 text-sm text-warning">{fileError}</p>}
      </div>
      {headers.length > 0 && (
        <>
          <fieldset className="card p-4">
            <legend className="px-1 font-semibold text-ink">Match your columns</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {TARGETS.map((t) => (
                <div key={t.key}>
                  <label htmlFor={`map-${t.key}`} className="field-label text-sm">
                    {t.label} {"required" in t && t.required && <span className="font-normal text-muted">(required)</span>}
                  </label>
                  <select id={`map-${t.key}`} className="input" value={map[t.key] ?? ""}
                    onChange={(e) => setMap({ ...map, [t.key]: e.target.value })}>
                    <option value="">Not in file</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </fieldset>
          <div>
            <p className="font-semibold text-ink">Preview: first 5 of {mapped.length} rows</p>
            {mapped.some((r) => !r.company_name) && (
              <p className="mt-1 text-sm text-warning">
                {mapped.filter((r) => !r.company_name).length} rows have no company. Each of those people will get an
                &ldquo;Organisation to confirm&rdquo; placeholder that they can rename on the day.
              </p>
            )}
            <div className="relative mt-2 overflow-x-auto">
              <table className="table">
                <thead><tr>{TARGETS.map((t) => <th key={t.key} scope="col">{t.label}</th>)}</tr></thead>
                <tbody>
                  {mapped.slice(0, 5).map((r, i) => (
                    <tr key={i}>{TARGETS.map((t) => <td key={t.key} className="text-sm">{r[t.key]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" disabled={pending || !map.company_name || mapped.length === 0}
              onClick={() => run(async () => {
                const r = await importRegistrations({ slug, rows: mapped });
                if (r.ok) { setHeaders([]); setRows([]); }
                return r;
              })}>
              {pending ? "Importing" : `Import ${mapped.length} rows`}
            </button>
            {status}
          </div>
        </>
      )}
      {headers.length === 0 && status}
    </div>
  );
}

// Companies ----------------------------------------------------------------------

type CompanyRow = {
  id: string;
  name: string;
  table_id: string | null;
  size_band: string | null;
  is_locked: boolean;
  is_walk_in: boolean;
  org_to_confirm: boolean;
  people: number;
  facilitator_name: string | null;
};

export function CompaniesPanel({ slug, companies, tables }: { slug: string; companies: CompanyRow[]; tables: Table[] }) {
  const { pending, run, status } = useRun();
  const [filter, setFilter] = useState("");
  const list = companies.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="company-filter" className="field-label">Find a company</label>
          <input id="company-filter" className="input" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {status}
      </div>
      <div className="relative overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th scope="col">Company</th><th scope="col">People</th><th scope="col">Size</th><th scope="col">Table</th><th scope="col">Facilitator</th><th scope="col">Checks</th><th scope="col">Editing</th></tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const checks = [
                c.org_to_confirm && "Organisation to confirm",
                !c.size_band && "Size missing",
                c.size_band === "200+" && "Over 200 staff",
                !c.table_id && "No table",
              ].filter(Boolean) as string[];
              return (
                <tr key={c.id}>
                  <td>
                    <a className="link font-semibold" href={`/console/${slug}/company/${c.id}`}>{c.name}</a>
                    {c.is_walk_in && <span className="pill pill-teal ml-2">Walk-in</span>}
                  </td>
                  <td>{c.people}</td>
                  <td className="whitespace-nowrap text-sm">{c.size_band ? SIZE_BAND_LABELS[c.size_band as SizeBand] : ""}</td>
                  <td>
                    <label htmlFor={`tbl-${c.id}`} className="sr-only">Table for {c.name}</label>
                    <select id={`tbl-${c.id}`} className="input" value={c.table_id ?? ""} disabled={pending}
                      onChange={(e) => run(() => setCompanyTable({ slug, companyId: c.id, tableId: e.target.value || null }))}>
                      <option value="">None</option>
                      {tables.map((t) => <option key={t.id} value={t.id}>Table {t.number}</option>)}
                    </select>
                  </td>
                  <td className="text-sm">{c.facilitator_name ?? <span className="text-muted">Set on the table</span>}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {checks.length === 0 ? <span className="pill pill-success">OK</span> : checks.map((x) => <span key={x} className="pill pill-warning">{x}</span>)}
                    </span>
                  </td>
                  <td>
                    <button className={`btn btn-small ${c.is_locked ? "btn-secondary" : "btn-danger"}`} disabled={pending}
                      onClick={() => run(() => setCompanyLocked({ slug, companyId: c.id, locked: !c.is_locked }))}>
                      {c.is_locked ? "Unlock" : "Lock"}<span className="sr-only"> {c.name}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Device sessions ----------------------------------------------------------------

type Session = { id: string; person: string; company: string; device_label: string | null; last_seen_at: string; created_at: string };

export function SessionsPanel({ slug, sessions }: { slug: string; sessions: Session[] }) {
  const { pending, run, status } = useRun();
  return (
    <div className="grid gap-2">
      {status}
      <div className="relative overflow-x-auto">
        <table className="table">
          <thead><tr><th scope="col">Person</th><th scope="col">Company</th><th scope="col">Device</th><th scope="col">Last seen</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="font-medium text-ink">{s.person}</td>
                <td>{s.company}</td>
                <td className="max-w-[280px] truncate text-xs text-muted" title={s.device_label ?? ""}>{s.device_label}</td>
                <td className="whitespace-nowrap text-sm">{new Date(s.last_seen_at).toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", minute: "2-digit" })}</td>
                <td>
                  <button className="btn btn-danger btn-small" disabled={pending}
                    onClick={() => window.confirm(`Sign ${s.person} out of this device?`) && run(() => revokeSession({ slug, sessionId: s.id }))}>
                    Revoke<span className="sr-only"> session for {s.person}</span>
                  </button>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && <tr><td colSpan={5} className="text-muted">No active sessions.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Staff --------------------------------------------------------------------------

export function StaffPanel({ slug, staff, me }: { slug: string; staff: Staff[]; me: string }) {
  const { pending, run, status } = useRun();
  const [form, setForm] = useState({ name: "", email: "", role: "facilitator" });
  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {staff.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line p-3">
            <span><span className="font-medium text-ink">{s.name}</span> <span className="text-sm text-muted">{s.email}</span> <span className="pill">{s.role}</span></span>
            {s.id !== me && (
              <button className="btn btn-danger btn-small" disabled={pending}
                onClick={() => window.confirm(`Remove ${s.name} from the team?`) && run(() => removeStaff({ slug, staffId: s.id }))}>
                Remove<span className="sr-only"> {s.name}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
        <div><label htmlFor="st-name" className="field-label">Name</label><input id="st-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label htmlFor="st-email" className="field-label">Email</label><input id="st-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div>
          <label htmlFor="st-role" className="field-label">Role</label>
          <select id="st-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="facilitator">Facilitator</option><option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn" disabled={pending} onClick={() => run(async () => {
          const r = await addStaff({ slug, ...form });
          if (r.ok) setForm({ name: "", email: "", role: "facilitator" });
          return r;
        })}>Add</button>
      </div>
      {status}
    </div>
  );
}

// Privacy requests ---------------------------------------------------------------

type Person = { id: string; name: string; email: string | null; company: string };

export function PrivacyPanel({ slug, people }: { slug: string; people: Person[] }) {
  const { pending, run, status } = useRun();
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<Record<string, string>>({});
  const matches = q.trim().length >= 2
    ? people.filter((p) => `${p.name} ${p.email ?? ""} ${p.company}`.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : [];
  return (
    <div className="grid gap-3">
      <div>
        <label htmlFor="privacy-q" className="field-label">Find a person by name, email or company</label>
        <input id="privacy-q" className="input max-w-md" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {status}
      <ul className="grid gap-2">
        {matches.map((p) => (
          <li key={p.id} className="grid gap-2 rounded-[10px] border border-line p-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div>
              <p className="font-medium text-ink">{p.name}</p>
              <p className="text-sm text-muted">{p.email ?? "No email"} · {p.company}</p>
            </div>
            <a className="btn btn-secondary btn-small" href={`/console/${slug}/people/${p.id}/export`}>Export their data (JSON)</a>
            <div className="flex items-end gap-2">
              <div>
                <label htmlFor={`del-${p.id}`} className="field-label text-sm">Type their name to delete</label>
                <input id={`del-${p.id}`} className="input" value={confirm[p.id] ?? ""} onChange={(e) => setConfirm({ ...confirm, [p.id]: e.target.value })} />
              </div>
              <button className="btn btn-danger btn-small" disabled={pending || (confirm[p.id] ?? "").trim().toLowerCase() !== p.name.toLowerCase()}
                onClick={() => run(() => deletePerson({ slug, personId: p.id, confirmName: confirm[p.id] ?? "" }))}>
                Delete all
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
