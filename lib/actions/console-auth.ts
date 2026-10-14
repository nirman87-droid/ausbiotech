"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { devLoginEnabled, env, supabaseConfigured } from "@/lib/env";
import { setDevStaffCookie, supabaseServer } from "@/lib/staff";

export type LoginState = { sent?: boolean; error?: string };

const emailSchema = z.object({ email: z.string().trim().email("Enter a valid email.") });

// Sends a Supabase magic link, but only to emails listed in the staff table.
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!supabaseConfigured) return { error: "Supabase Auth is not configured." };
  const db = await getDb();
  const staff = await db.one("select id from staff where lower(email) = lower($1)", [parsed.data.email]);
  // Same answer either way, so the form does not reveal who is on the team.
  if (staff) {
    const h = await headers();
    const origin = h.get("origin") ?? env.appUrl;
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: `${origin}/console/auth/callback`, shouldCreateUser: true },
    });
    if (error) {
      console.error("magic link failed", error.message);
      return { error: "We could not send the email. Try again in a minute." };
    }
  }
  return { sent: true };
}

const devSchema = z.object({ staffId: z.string().uuid() });

// Local development only: sign in as a seeded staff member without email.
export async function devSignIn(form: FormData) {
  if (!devLoginEnabled) throw new Error("Dev sign in is disabled.");
  const parsed = devSchema.safeParse({ staffId: form.get("staffId") });
  if (!parsed.success) redirect("/console/login");
  await setDevStaffCookie(parsed.data.staffId);
  redirect("/console");
}
