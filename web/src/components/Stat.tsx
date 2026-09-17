/* a metric tile. a sheet, not glass: a reading about the product is not the
   product surface itself. */
export default function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="sheet p-4 sm:p-5 min-h-[112px] flex flex-col">
      <div className="eyebrow mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis">{label}</div>
      <div className="text-2xl sm:text-3xl font-semibold tracking-tight tabular" style={accent ? { color: "var(--orange-text)" } : undefined}>{value}</div>
      {sub && <div className="text-[11px] sm:text-xs text-ink/70 mt-auto pt-1.5">{sub}</div>}
    </div>
  );
}
