// Simple frame for pages before a participant has picked their name.
export function PublicShell({ children, eyebrow }: { children: React.ReactNode; eyebrow?: string }) {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <p className="mono-label">AI Use Case Builder</p>
          {eyebrow && <p className="text-sm text-muted">{eyebrow}</p>}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        {children}
      </main>
    </>
  );
}
