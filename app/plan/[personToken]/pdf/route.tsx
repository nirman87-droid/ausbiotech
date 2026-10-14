import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadPlanForToken } from "@/lib/plan-access";
import { planPdfData } from "@/lib/plans";
import { PlanDoc } from "@/lib/pdf/PlanDoc";

export const runtime = "nodejs";

// P9: download the latest sent plan as a one page PDF.
export async function GET(_req: Request, { params }: { params: Promise<{ personToken: string }> }) {
  const { personToken } = await params;
  const data = await loadPlanForToken(personToken);
  if (!data?.plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await renderToBuffer(<PlanDoc d={planPdfData(data.plan, data.company_name, data.event.name)} />);
  const name = data.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}-ai-starter-plan-v${data.plan.version}.pdf"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
