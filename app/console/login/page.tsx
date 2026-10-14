import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { devLoginEnabled, supabaseConfigured } from "@/lib/env";
import { devSignIn } from "@/lib/actions/console-auth";
import type { StaffRow } from "@/lib/types";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Team sign in" };

export default async function Login() {
  const staff = devLoginEnabled
    ? await (await getDb()).query<StaffRow>("select id, email, name, role from staff order by role, name")
    : [];
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <p className="mono-label">ARM Hub team console</p>
      <h1 className="mt-2 text-3xl font-semibold">Sign in</h1>
      {supabaseConfigured && <LoginForm />}
      {devLoginEnabled && (
        <section className="mt-6" aria-labelledby="dev-title">
          <h2 id="dev-title" className="text-lg font-semibold">Local development sign in</h2>
          <p className="mt-1 text-sm text-muted">
            Supabase Auth is not configured, so you can pick a staff member. This option never appears in production.
          </p>
          <ul className="mt-3 grid gap-2">
            {staff.map((s) => (
              <li key={s.id}>
                <form action={devSignIn}>
                  <input type="hidden" name="staffId" value={s.id} />
                  <button className="btn btn-secondary w-full justify-between" type="submit">
                    <span>{s.name}</span>
                    <span className="text-sm font-normal">{s.role}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!supabaseConfigured && !devLoginEnabled && (
        <p className="notice notice-warning mt-6">Sign in is not configured. Set the Supabase environment variables.</p>
      )}
    </main>
  );
}
