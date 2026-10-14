import Link from "next/link";
import type { StaffRow } from "@/lib/types";

export function ConsoleHeader({ staff, children }: { staff: StaffRow; children?: React.ReactNode }) {
  return (
    <header className="no-print border-b border-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/console" className="font-semibold text-ink">
            <span className="mono-label block">ARM Hub</span>
            Team console
          </Link>
          {children}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {staff.name} <span className="pill">{staff.role}</span>
          </span>
          <form method="post" action="/console/logout">
            <button className="btn btn-secondary btn-small" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
