import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { getDb } from "./db";
import { env, supabaseConfigured, devLoginEnabled } from "./env";
import { sign, unsign } from "./sign";
import type { StaffRow } from "./types";

// Staff sign in with a Supabase magic link. Their auth user id becomes staff.id.
// Without Supabase (local development only) a signed dev cookie stands in.

export const DEV_STAFF_COOKIE = "ucb_staff";

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) jar.set(c.name, c.value, c.options);
        } catch {
          // Server components cannot set cookies. The middleware refreshes them instead.
        }
      },
    },
  });
}

export async function getStaff(): Promise<StaffRow | null> {
  const db = await getDb();
  if (supabaseConfigured) {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user?.email) return null;
    const byId = await db.one<StaffRow>("select id, email, name, role from staff where id = $1", [user.id]);
    if (byId) return byId;
    // First sign in: bind the invited staff row to this auth user.
    const byEmail = await db.one<StaffRow>(
      "update staff set id = $1 where lower(email) = lower($2) returning id, email, name, role",
      [user.id, user.email],
    );
    return byEmail;
  }
  if (!devLoginEnabled) return null;
  const jar = await cookies();
  const id = unsign(jar.get(DEV_STAFF_COOKIE)?.value);
  if (!id) return null;
  return db.one<StaffRow>("select id, email, name, role from staff where id = $1", [id]);
}

export async function requireStaff(role?: "admin"): Promise<StaffRow> {
  const staff = await getStaff();
  if (!staff) redirect("/console/login");
  if (role === "admin" && staff.role !== "admin") redirect("/console?denied=1");
  return staff;
}

export async function setDevStaffCookie(staffId: string) {
  const jar = await cookies();
  jar.set(DEV_STAFF_COOKIE, sign(staffId), { httpOnly: true, sameSite: "lax", path: "/", secure: env.isProduction });
}
