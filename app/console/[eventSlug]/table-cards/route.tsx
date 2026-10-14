import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { getDb } from "@/lib/db";
import { getStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { env } from "@/lib/env";
import { TableCardsDoc } from "@/lib/pdf/TableCards";

export const runtime = "nodejs";

// A0: printable table cards with QR codes, as a PDF.
export async function GET(request: Request, { params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const staff = await getStaff();
  if (!staff || staff.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const event = await getEventBySlug(eventSlug);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const tables = await db.query<{ id: string; number: number; table_token: string; companies: string[] | null }>(
    `select t.id, t.number, t.table_token,
       (select array_agg(c.name order by c.name) from companies c where c.table_id = t.id) as companies
       from tables t where t.event_id = $1 order by t.number`,
    [event.id],
  );
  const base = (process.env.APP_URL ? env.appUrl : new URL(request.url).origin).replace(/\/$/, "");
  const cards = await Promise.all(
    tables.map(async (t) => {
      const url = `${base}/${event.slug}/t/${t.table_token}`;
      return {
        number: t.number,
        url,
        qr: await QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: "M", color: { dark: "#12262B", light: "#FFFFFF" } }),
        companies: t.companies ?? [],
      };
    }),
  );
  const pdf = await renderToBuffer(<TableCardsDoc eventName={event.name} cards={cards} />);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${event.slug}-table-cards.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
