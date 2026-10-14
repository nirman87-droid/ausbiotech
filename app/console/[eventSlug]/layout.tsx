import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug } from "@/lib/queries";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { ConsoleNav } from "@/components/console/ConsoleNav";

export default async function EventConsoleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const staff = await requireStaff();
  const event = await getEventBySlug(eventSlug);
  if (!event) notFound();
  return (
    <>
      <ConsoleHeader staff={staff}>
        <span className="hidden text-muted sm:inline">/</span>
        <span className="font-medium text-ink">{event.name}</span>
      </ConsoleHeader>
      <ConsoleNav slug={event.slug} isAdmin={staff.role === "admin"} />
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </>
  );
}
