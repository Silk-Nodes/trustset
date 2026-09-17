/* the trustset face: top bar, two orange eyes, bottom bar, on a tile that
   follows the theme. drawn inline so the ink flips with the theme. */
export default function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="trustset" className="shrink-0">
      <rect width="48" height="48" rx="10" fill="var(--text-dark)" />
      <rect x="12" y="13" width="24" height="5" fill="var(--bg-base)" />
      <rect x="12" y="22" width="9" height="6" fill="var(--orange)" />
      <rect x="27" y="22" width="9" height="6" fill="var(--orange)" />
      <rect x="12" y="32" width="24" height="5" fill="var(--bg-base)" />
    </svg>
  );
}
