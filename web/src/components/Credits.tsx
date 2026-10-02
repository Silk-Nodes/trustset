/* the two sponsors whose work runs inside trustset, credited where it runs.
 *
 * dynamic's mark is their own file from their brand kit, never redrawn or
 * recoloured: the dark mono logo on the light theme, their white logo on the
 * dark one, swapped by css so the right one paints first. mera publishes no
 * mark, so it is credited by name. */
export function DynamicMark({ height = 14 }: { height?: number }) {
  const w = Math.round(height * 4.48);
  return (
    <a href="https://www.dynamic.xyz" target="_blank" rel="noreferrer" aria-label="Dynamic" className="inline-flex items-center shrink-0 align-middle outline-none focus-visible:ring-2 rounded-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/dynamic-logo-ink.svg" alt="" width={w} height={height} className="theme-light-only" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/dynamic-logo-white.svg" alt="" width={w} height={height} className="theme-dark-only" />
    </a>
  );
}

export function MeraName() {
  return <a href="https://mera.category.xyz" target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-[3px]" style={{ color: "var(--text-dark)" }}>Mera</a>;
}

/* "secured by" and the mark, the line under the email sign-in */
export function SecuredByDynamic() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] mono uppercase tracking-[0.1em] whitespace-nowrap" style={{ color: "var(--text-faint)" }}>
      secured by <DynamicMark height={13} />
    </span>
  );
}
