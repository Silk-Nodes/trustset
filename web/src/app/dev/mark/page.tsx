import { notFound } from "next/navigation";
import Mark from "@/components/Mark";

/* a bench for the face, off in production: every mood at a few sizes, so the
   look, the blink and the switch reaction can be checked without switching a
   real agent off. it does not exist on the deployed site. */
export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const moods = ["awake", "paused", "stopped"] as const;
  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-5 pt-12 pb-16 min-w-0">
      <div className="grid grid-cols-3 gap-8 max-w-xl">
        {moods.map(m => (
          <div key={m} data-mood={m} className="flex flex-col items-center gap-4">
            <Mark size={96} mood={m} />
            <div className="flex items-end gap-3"><Mark size={34} mood={m} /><Mark size={24} mood={m} /><Mark size={20} mood={m} /></div>
            <span className="mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-medium)" }}>{m}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
