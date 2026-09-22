import type { LayerKey } from "@/lib/layers";

/* one mark per layer, eight marks, one stroke weight.
 *
 * drawn here rather than pulled from an icon set so the eight read as one
 * family. an icon on its own is never the label: in the inspector the name
 * sits beside it, and in the fleet the column header carries it. */
const PATHS: Record<LayerKey, React.ReactNode> = {
  switch: <><path d="M12 3v8" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></>,
  panic: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="12" cy="12" r="3.2" /></>,
  guardians: <><path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z" /></>,
  limits: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  past: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4v4h4" /><path d="M12 8v4l2.5 1.5" /></>,
  identity: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M14 9.5h4M14 13h4M5.5 16c.6-1.4 1.7-2 3-2s2.4.6 3 2" /></>,
  human: <><path d="M8 11.5V9a4 4 0 0 1 8 0v2.5" /><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0v2a5.5 5.5 0 0 1-11 0z" /><path d="M12 9v6" /></>,
  refunds: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
};

export default function LayerIcon({ k, size = 16, className, style }: { k: LayerKey; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className} style={style}>
      {PATHS[k]}
    </svg>
  );
}
