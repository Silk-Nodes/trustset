"use client";
import { useState } from "react";
import type { Layer, LayerKey } from "@/lib/layers";

/* the trust stack, drawn, per agent.
 *
 * eight bars, one per layer, in the order the site names them. a filled bar
 * is a layer that is set for this agent, an outlined one is a layer it does
 * not have yet. the line underneath names whichever bar is under the pointer
 * or focused, and otherwise says how many are set, so the bars are never a
 * picture without words. pressing a bar opens that layer's control, which is
 * how a gap becomes one press from its fix. */
export default function Stack({ layers, onLayer, compact = false }: { layers: Layer[]; onLayer?: (k: LayerKey) => void; compact?: boolean }) {
  const [hover, setHover] = useState<Layer | null>(null);
  const setCount = layers.filter(l => l.set).length;
  const shown = hover ?? null;
  return (
    <div className="min-w-0">
      <div className="flex gap-1" role="list" aria-label={`${setCount} of ${layers.length} layers set`}>
        {layers.map(l => (
          <button key={l.key} type="button" role="listitem" aria-label={`${l.name}: ${l.value}${l.set ? "" : ", not set"}`}
            onMouseEnter={() => setHover(l)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(l)} onBlur={() => setHover(null)}
            onClick={() => onLayer?.(l.key)}
            className="flex-1 h-[7px] rounded-full outline-none focus-visible:ring-2 transition-transform hover:scale-y-[1.6] focus-visible:scale-y-[1.6]"
            style={{
              background: l.set ? "var(--text-dark)" : "transparent",
              border: `1.5px solid ${l.set ? "var(--text-dark)" : "var(--text-light)"}`,
              transformOrigin: "center",
            }} />
        ))}
      </div>
      {!compact && (
        <div className="mt-2 text-[12px] leading-[16px] min-h-[16px] flex items-baseline gap-2" style={{ color: "var(--text-medium)" }}>
          {shown
            ? <><span className="font-semibold" style={{ color: "var(--text-dark)" }}>{shown.name}</span><span className="truncate">{shown.value}</span></>
            : <span><span className="font-semibold tabular" style={{ color: "var(--text-dark)" }}>{setCount} of {layers.length}</span> layers set</span>}
        </div>
      )}
    </div>
  );
}
