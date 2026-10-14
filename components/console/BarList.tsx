// A single-series horizontal bar list. One hue, values printed in text colour, and
// the numbers are readable without the bars (the list doubles as the table view).
export function BarList({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section className="card p-4" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 || rows.every((r) => r.value === 0) ? (
        <p className="mt-2 text-sm text-muted">No data yet.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(110px,40%)_1fr_3rem] items-center gap-3 text-sm" title={`${r.label}: ${r.value}${total ? ` of ${total}` : ""}`}>
              <span className="text-body">{r.label}</span>
              <span className="h-3 rounded-r-[4px] bg-line/40" aria-hidden="true">
                <span className="block h-full rounded-r-[4px] bg-teal" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }} />
              </span>
              <span className="text-right font-mono tabular-nums text-ink">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
