import type { Metadata } from "next";
import { InfoTip } from "@/components/Tip";
import Panic from "./Panic";

export const metadata: Metadata = { title: "Pause an agent" };
export const dynamic = "force-dynamic";

/* deliberately bare: no header, no footer, no navigation. somebody opening this
   is in a hurry, usually on a phone, and there is exactly one thing to do. */
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <main className="min-h-[100svh] w-full px-5 py-10 flex flex-col justify-center">
      <div className="mx-auto w-full max-w-[420px] mb-7">
        <h1 className="text-[32px] font-semibold tracking-[-0.03em] leading-[1.05]">
          Pause an agent<br /><span style={{ color: "var(--dim)" }}>with your fingerprint.</span>
        </h1>
        <p className="text-[13.5px] mt-3 flex items-center" style={{ color: "var(--text-medium)" }}>
          No wallet, no seed phrase, no gas.<InfoTip text="Your passkey signs, the chain checks it against the key the owner nominated, and the agent is paused in the next block." />
        </p>
      </div>
      <Panic initialId={id} />
    </main>
  );
}
