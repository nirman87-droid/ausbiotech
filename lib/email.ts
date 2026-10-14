import "server-only";
import { getDb } from "./db";
import { env } from "./env";

// Sends one email through Resend and records it in email_outbox.
// Without RESEND_API_KEY (local development) the email is only logged, never sent.
export async function sendEmail(input: { eventId: string | null; to: string; subject: string; text: string }) {
  const db = await getDb();
  const row = await db.one<{ id: string }>(
    "insert into email_outbox (event_id, to_email, subject, body_text) values ($1, $2, $3, $4) returning id",
    [input.eventId, input.to, input.subject, input.text],
  );
  if (!env.resendKey) {
    console.log(`[email not sent: no RESEND_API_KEY] to=${input.to} subject="${input.subject}"\n${input.text}`);
    await db.query("update email_outbox set status = 'logged' where id = $1", [row!.id]);
    return { ok: true as const, logged: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [input.to], subject: input.subject, text: input.text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
    await db.query("update email_outbox set status = 'sent', provider_id = $2 where id = $1", [row!.id, body.id ?? null]);
    return { ok: true as const, logged: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.query("update email_outbox set status = 'failed', error = $2 where id = $1", [row!.id, message.slice(0, 500)]);
    return { ok: false as const, error: message };
  }
}
