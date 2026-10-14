"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ConsoleNav({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const items = [
    ...(isAdmin ? [{ href: `/console/${slug}/setup`, label: "Setup" }] : []),
    { href: `/console/${slug}/live`, label: "Live" },
    { href: `/console/${slug}/poll-screen`, label: "Poll screen" },
    ...(isAdmin ? [{ href: `/console/${slug}/plans`, label: "Plans" }] : []),
    { href: `/console/${slug}/insights`, label: "Insights" },
  ];
  return (
    <nav aria-label="Event sections" className="no-print border-b border-line bg-white">
      <ul className="relative mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
        {items.map((i) => {
          const here = pathname.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={here ? "page" : undefined}
                className={`flex min-h-[44px] items-center border-b-2 px-3 text-sm font-medium ${
                  here ? "border-teal text-ink" : "border-transparent text-teal hover:border-line"
                }`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
