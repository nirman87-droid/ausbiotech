import { NextResponse } from "next/server";
import { getEventBySlug, getTableByToken } from "@/lib/queries";
import { tablePassCookie } from "@/lib/session";

// The table QR code points here. A valid token sets a table pass cookie and opens P1.
export async function GET(request: Request, { params }: { params: Promise<{ eventSlug: string; tableToken: string }> }) {
  const { eventSlug, tableToken } = await params;
  const event = await getEventBySlug(eventSlug);
  const table = event ? await getTableByToken(event.id, tableToken) : null;
  if (!event || !table) {
    return NextResponse.redirect(new URL(`/${eventSlug}/no-access`, request.url), 303);
  }
  const res = NextResponse.redirect(new URL(`/${event.slug}/table`, request.url), 303);
  res.cookies.set(tablePassCookie(event.id, table.id, event.access_closes_at));
  return res;
}
