import type { Metadata } from "next";
import { readFile } from "fs/promises";
import { join } from "path";
import Explorer from "./Explorer";
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
      {/* wide, like the console. the directory is a table of every agent on the
          switch and a centred 1152px column was spending a third of a desktop
          on margins while the marks column ran out of room.

          no headline and no paragraph. this is a tool, and the page opened with
          a marketing hero and an explanation of the indexer's block window,
          which is a thing a reader looking up an agent has no use for. the live
          agent used to sit on top as a banner, but it is one agent of many and
          it is a row in the directory like the rest. */}
      <main className="w-full px-4 sm:px-5 pt-6 sm:pt-8 pb-16 min-w-0">
        <Explorer explorer={await explorerUrl()} />
      </main>
      <Footer />
    </>
  );
}
