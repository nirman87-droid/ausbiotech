import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/staff";

// Supabase magic links land here. Swaps the one-time code for a session cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/console", request.url), 303);
}
