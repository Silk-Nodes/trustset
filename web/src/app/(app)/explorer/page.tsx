import type { Metadata } from "next";
import { readFile } from "fs/promises";
import { join } from "path";
import Explorer from "./Explorer";
import { TopBar } from "@/components/app/AppShell";

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
      {/* a lookup and a feed, not a directory. there is no headline and no
          paragraph beyond the question the page answers: this is a tool, and
          a reader arrives with one agent in mind. */}
      <TopBar title="Explorer" />
      <main className="w-full px-4 sm:px-5 pt-6 pb-12 min-w-0">
        <Explorer explorer={await explorerUrl()} />
      </main>
    </>
  );
}
