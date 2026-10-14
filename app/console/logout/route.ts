import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseConfigured } from "@/lib/env";
import { DEV_STAFF_COOKIE, supabaseServer } from "@/lib/staff";

export async function POST(request: Request) {
  if (supabaseConfigured) await (await supabaseServer()).auth.signOut();
  (await cookies()).delete(DEV_STAFF_COOKIE);
  return NextResponse.redirect(new URL("/console/login", request.url), 303);
}
