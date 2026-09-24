import type { Metadata } from "next";
import { InfoTip } from "@/components/Tip";
import Passkey from "./Passkey";

export const metadata: Metadata = { title: "Nominate a passkey", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/* the owner's side of the panic button, and the only page that has to be opened
   on the device whose fingerprint will do the pausing. */
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <main className="min-h-[100svh] w-full px-5 py-10">
      <div className="mx-auto w-full max-w-[560px] mb-7">
        <h1 className="text-[32px] font-semibold tracking-[-0.03em] leading-[1.05]">
          Nominate a passkey<br /><span style={{ color: "var(--dim)" }}>that can pause this agent.</span>
        </h1>
        <p className="text-[13.5px] mt-3 flex items-center" style={{ color: "var(--text-medium)" }}>
          Do this on the phone you would reach for.<InfoTip text="The device keeps the private half, the switch keeps the public one, and afterwards a fingerprint is enough to pause the agent from anywhere." />
        </p>
      </div>
      <Passkey initialId={id} />
    </main>
  );
}
