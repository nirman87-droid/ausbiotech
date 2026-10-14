"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "@/lib/actions/console-auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  if (state.sent) {
    return (
      <p className="notice notice-success mt-6" role="status">
        If that email belongs to the ARM Hub team, a sign-in link is on its way. Open it on this device.
      </p>
    );
  }
  return (
    <form action={action} className="mt-6 grid gap-4">
      <div>
        <label htmlFor="email" className="field-label">Staff email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input"
          aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "email-err" : undefined} />
        {state.error && <span id="email-err" className="field-hint text-warning">{state.error}</span>}
      </div>
      <div>
        <button className="btn" type="submit" disabled={pending}>{pending ? "Sending" : "Email me a sign-in link"}</button>
      </div>
    </form>
  );
}
