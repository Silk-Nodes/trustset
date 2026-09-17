import type { Metadata } from "next";
import { readFile } from "fs/promises";
import { join } from "path";
import Explorer from "./Explorer";
import LiveAgent from "@/components/LiveAgent";
import Footer from "@/components/Footer";

export const metadata: Metadata = { title: "Explorer" };
export const dynamic = "force-dynamic";

async function explorerUrl() {
  try {
    const root = process.env.TRUSTSET_ROOT || join(process.cwd(), "..");
    const d = JSON.parse(await readFile(join(root, "deployments", "monad-testnet.json"), "utf8"));
    return d.chainId === 10143 ? "https://testnet.monadexplorer.com" : "";
  } catch { return "https://testnet.monadexplorer.com"; }
}

export default async function Page() {
  return (
    <>
      <main className="w-full max-w-6xl mx-auto px-3 sm:px-4 pt-10 sm:pt-14 pb-16 min-w-0">
        <h1 className="text-[38px] sm:text-[54px] font-semibold tracking-[-0.035em] leading-[1.02] max-w-3xl">
          Every agent<br /><span style={{ color: "var(--dim)" }}>and every time trust changed.</span>
        </h1>
        <p className="text-lg sm:text-xl mt-5 mb-8 max-w-[54ch]" style={{ color: "var(--text-medium)" }}>
          Read from the chain and kept here, because Monad answers a hundred blocks of logs at a time and a browser cannot walk a day of them.
        </p>
        <div className="mb-8"><LiveAgent /></div>
        <Explorer explorer={await explorerUrl()} />
      </main>
      <Footer />
    </>
  );
}
