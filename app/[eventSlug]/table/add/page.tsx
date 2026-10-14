import Link from "next/link";
import type { Metadata } from "next";
import { requireTableAccess } from "@/lib/table-access";
import { PublicShell } from "@/components/PublicShell";
import { AddCompanyForm } from "./AddCompanyForm";

export const metadata: Metadata = { title: "Add my organisation" };

export default async function AddCompany({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const { event, table } = await requireTableAccess(eventSlug);
  return (
    <PublicShell eyebrow={table ? `Table ${table.number}` : undefined}>
      <p><Link className="link" href={`/${event.slug}/table`}>Back to organisations</Link></p>
      <h1 className="mt-4 text-3xl font-semibold">Add my organisation</h1>
      <p className="mt-2 text-lg">Tell us a little about your organisation. It takes under a minute.</p>
      <AddCompanyForm slug={event.slug} />
    </PublicShell>
  );
}
