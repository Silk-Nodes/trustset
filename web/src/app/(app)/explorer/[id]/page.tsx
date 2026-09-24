import type { Metadata } from "next";
import Link from "next/link";
import Agent from "./Agent";
import { TopBar } from "@/components/app/AppShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      {/* wide, like the explorer it came from */}
      <TopBar title={<><Link href="/explorer" className="hover:underline" style={{ color: "var(--text-medium)", fontWeight: 500 }}>Explorer</Link><span className="mx-1.5" style={{ color: "var(--text-light)" }}>/</span>Agent {id}</>} />
      <main className="w-full px-4 sm:px-5 pt-6 pb-12 min-w-0">
        <Agent id={Number(id)} explorer="https://testnet.monadexplorer.com" />
      </main>
    </>
  );
}
