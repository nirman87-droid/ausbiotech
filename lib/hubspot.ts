import "server-only";
import { getDb } from "./db";
import { env } from "./env";
import { SIZE_BAND_LABELS, type SizeBand } from "./copy";

// HubSpot sync (A4). Never automatic: staff preview, then confirm.
// * Every company becomes a HubSpot Company.
// * Only people with marketing consent become Contacts, associated to their Company.
// * The golden draft and final plan become a Note on the Company.
// * The lead rating sets the contacts' lead status, and the next action becomes a Task.
// Repeat runs update by the stored HubSpot id (or match by email / company name) and never duplicate.

// HANDOVER: confirm this mapping with whoever owns ARM Hub's HubSpot lead statuses.
export const LEAD_STATUS_MAP: Record<string, string> = { hot: "IN_PROGRESS", warm: "OPEN", cold: "BAD_TIMING" };

const API = "https://api.hubapi.com";
// HubSpot-defined association type ids.
const NOTE_TO_COMPANY = 190;
const TASK_TO_COMPANY = 192;

type SyncCompany = {
  id: string;
  name: string;
  website: string | null;
  sector: string | null;
  size_band: string | null;
  state: string | null;
  hubspot_company_id: string | null;
  hubspot_note_id: string | null;
  hubspot_task_id: string | null;
  lead_rating: string | null;
  next_action: string | null;
  action_due: string | null;
  golden_title: string | null;
  first_project: string | null;
  metric: string | null;
  baseline: string | null;
  target: string | null;
  plan_title: string | null;
  plan_recommendation: string | null;
  plan_version: number | null;
  people: { id: string; name: string; email: string | null; role: string | null; consent: boolean; hubspot_contact_id: string | null }[];
};

async function loadCompanies(eventId: string): Promise<SyncCompany[]> {
  const db = await getDb();
  return db.query<SyncCompany>(
    `select c.id, c.name, c.website, c.sector, c.size_band, c.state, c.hubspot_company_id, c.hubspot_note_id, c.hubspot_task_id,
       fn.lead_rating, fn.next_action, fn.action_due,
       pr.title as golden_title, gd.first_project, gd.metric, gd.baseline, gd.target,
       fp.title as plan_title, fp.recommendation as plan_recommendation, fp.version as plan_version,
       coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'email', p.email, 'role', p.role,
           'consent', p.marketing_consent, 'hubspot_contact_id', p.hubspot_contact_id) order by p.name)
         from people p where p.company_id = c.id), '[]'::json) as people
     from companies c
     left join facilitator_notes fn on fn.company_id = c.id
     left join problems pr on pr.id = c.golden_problem_id
     left join golden_drafts gd on gd.company_id = c.id and gd.problem_id = c.golden_problem_id
     left join lateral (select * from final_plans f where f.company_id = c.id and f.status in ('sent','opened')
                        order by f.version desc limit 1) fp on true
     where c.event_id = $1 order by c.name`,
    [eventId],
  );
}

export type SyncPreview = {
  companies: { id: string; name: string; action: "create" | "update"; contacts: number; skipped: number; note: boolean; task: boolean; leadStatus: string | null }[];
  totals: { companies: number; contacts: number; skippedNoConsent: number; notes: number; tasks: number };
  configured: boolean;
};

export async function buildPreview(eventId: string): Promise<SyncPreview> {
  const companies = await loadCompanies(eventId);
  const rows = companies.map((c) => {
    const consented = c.people.filter((p) => p.consent && p.email);
    return {
      id: c.id,
      name: c.name,
      action: (c.hubspot_company_id ? "update" : "create") as "create" | "update",
      contacts: consented.length,
      skipped: c.people.length - consented.length,
      note: Boolean(c.golden_title || c.plan_title),
      task: Boolean(c.next_action),
      leadStatus: c.lead_rating ? (LEAD_STATUS_MAP[c.lead_rating] ?? null) : null,
    };
  });
  return {
    companies: rows,
    totals: {
      companies: rows.length,
      contacts: rows.reduce((s, r) => s + r.contacts, 0),
      skippedNoConsent: rows.reduce((s, r) => s + r.skipped, 0),
      notes: rows.filter((r) => r.note).length,
      tasks: rows.filter((r) => r.task).length,
    },
    configured: Boolean(env.hubspotToken),
  };
}

async function hs<T = any>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.hubspotToken}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return hs(method, path, body, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HubSpot ${method} ${path.split("?")[0]} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

async function searchOne(objectType: string, property: string, value: string): Promise<string | null> {
  const r = await hs<{ results: { id: string }[] }>("POST", `/crm/v3/objects/${objectType}/search`, {
    filterGroups: [{ filters: [{ propertyName: property, operator: "EQ", value }] }],
    limit: 1,
  });
  return r.results[0]?.id ?? null;
}

function domainOf(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function esc(s: string | null | undefined) {
  return (s ?? "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);
}

function noteBody(c: SyncCompany, eventName: string) {
  const parts = [`<p><strong>${esc(eventName)}: AI Use Case Builder</strong></p>`];
  if (c.golden_title) {
    parts.push(
      `<p><strong>Golden use case:</strong> ${esc(c.golden_title)}</p>`,
      `<p><strong>First project:</strong> ${esc(c.first_project)}</p>`,
      `<p><strong>Measure:</strong> ${esc(c.metric)}${c.baseline ? `. Today: ${esc(c.baseline)}` : ""}${c.target ? `. Target: ${esc(c.target)}` : ""}</p>`,
    );
  }
  if (c.plan_title) {
    parts.push(`<p><strong>Final plan (version ${c.plan_version}):</strong> ${esc(c.plan_title)}</p>`, `<p>${esc(c.plan_recommendation)}</p>`);
  }
  return parts.join("");
}

export type SyncResult = { companies: number; contacts: number; notes: number; tasks: number; errors: { company: string; error: string }[] };

export async function runSync(eventId: string, eventName: string): Promise<SyncResult> {
  if (!env.hubspotToken) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN is not set.");
  const db = await getDb();
  const companies = await loadCompanies(eventId);
  const result: SyncResult = { companies: 0, contacts: 0, notes: 0, tasks: 0, errors: [] };

  for (const c of companies) {
    try {
      const props: Record<string, string> = { name: c.name };
      const domain = domainOf(c.website);
      if (domain) props.domain = domain;
      if (c.state) props.state = c.state;
      if (c.sector) props.description = `Sector: ${c.sector}. Staff: ${c.size_band ? SIZE_BAND_LABELS[c.size_band as SizeBand] : "not given"}.`;

      let companyHsId = c.hubspot_company_id ?? (await searchOne("companies", "name", c.name));
      if (companyHsId) await hs("PATCH", `/crm/v3/objects/companies/${companyHsId}`, { properties: props });
      else companyHsId = (await hs<{ id: string }>("POST", "/crm/v3/objects/companies", { properties: props })).id;
      await db.query("update companies set hubspot_company_id = $2 where id = $1", [c.id, companyHsId]);
      result.companies++;

      const leadStatus = c.lead_rating ? LEAD_STATUS_MAP[c.lead_rating] : undefined;
      for (const p of c.people) {
        if (!p.consent || !p.email) continue; // consent is required to become a contact
        const [firstname, ...rest] = p.name.split(" ");
        const cprops: Record<string, string> = { email: p.email, firstname, lastname: rest.join(" ") };
        if (p.role) cprops.jobtitle = p.role;
        if (leadStatus) cprops.hs_lead_status = leadStatus;
        let contactId = p.hubspot_contact_id ?? (await searchOne("contacts", "email", p.email));
        if (contactId) await hs("PATCH", `/crm/v3/objects/contacts/${contactId}`, { properties: cprops });
        else contactId = (await hs<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties: cprops })).id;
        await hs("PUT", `/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyHsId}`);
        await db.query("update people set hubspot_contact_id = $2 where id = $1", [p.id, contactId]);
        result.contacts++;
      }

      if (c.golden_title || c.plan_title) {
        const properties = { hs_timestamp: new Date().toISOString(), hs_note_body: noteBody(c, eventName) };
        let noteId = c.hubspot_note_id;
        if (noteId) await hs("PATCH", `/crm/v3/objects/notes/${noteId}`, { properties });
        else {
          noteId = (await hs<{ id: string }>("POST", "/crm/v3/objects/notes", {
            properties,
            associations: [{ to: { id: companyHsId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_COMPANY }] }],
          })).id;
        }
        await db.query("update companies set hubspot_note_id = $2 where id = $1", [c.id, noteId]);
        result.notes++;
      }

      if (c.next_action) {
        const due = c.action_due ? new Date(`${c.action_due}T09:00:00+10:00`) : new Date(Date.now() + 7 * 86_400_000);
        const properties = {
          hs_timestamp: due.toISOString(),
          hs_task_subject: `${c.name}: ${c.next_action}`.slice(0, 250),
          hs_task_body: `From ${eventName}.`,
          hs_task_status: "NOT_STARTED",
        };
        let taskId = c.hubspot_task_id;
        if (taskId) await hs("PATCH", `/crm/v3/objects/tasks/${taskId}`, { properties });
        else {
          taskId = (await hs<{ id: string }>("POST", "/crm/v3/objects/tasks", {
            properties,
            associations: [{ to: { id: companyHsId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: TASK_TO_COMPANY }] }],
          })).id;
        }
        await db.query("update companies set hubspot_task_id = $2 where id = $1", [c.id, taskId]);
        result.tasks++;
      }
    } catch (err) {
      result.errors.push({ company: c.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
