import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDb } from "@/lib/db";
import { getStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { latestPlan, planPdfData } from "@/lib/plans";
import { PlanDoc } from "@/lib/pdf/PlanDoc";
import type { FinalPlanRow } from "@/lib/types";

export const runtime = "nodejs";

// A5: preview the plan PDF (latest version, or ?version=N).
export async function GET(request: Request, { params }: { params: Promise<{ eventSlug: string; companyId: string }> }) {
  const { eventSlug, companyId } = await params;
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (staff.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const event = await getEventBySlug(eventSlug);
  if (!event || !/^[0-9a-f-]{36}$/.test(companyId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const company = await db.one<{ name: string }>("select name from companies where id = $1 and event_id = $2", [companyId, event.id]);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const v = Number(new URL(request.url).searchParams.get("version"));
  const plan = Number.isInteger(v) && v > 0
    ? await db.one<FinalPlanRow>("select * from final_plans where company_id = $1 and version = $2", [companyId, v])
    : await latestPlan(db, companyId);
  if (!plan) return NextResponse.json({ error: "No plan yet" }, { status: 404 });
  const pdf = await renderToBuffer(<PlanDoc d={planPdfData(plan, company.name, event.name)} />);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="plan-preview-v${plan.version}.pdf"`, "Cache-Control": "no-store" },
  });
}
