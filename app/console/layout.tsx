// Console pages depend on who is signed in, so they are always rendered per request.
export const dynamic = "force-dynamic";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
