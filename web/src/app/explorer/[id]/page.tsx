import type { Metadata } from "next";
import Link from "next/link";
import Agent from "./Agent";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <main className="w-full max-w-6xl mx-auto px-3 sm:px-4 pt-10 sm:pt-12 pb-16 min-w-0">
        <Link href="/explorer" className="text-sm hover:underline" style={{ color: "var(--text-medium)" }}>← Explorer</Link>
        <h1 className="text-[32px] sm:text-[44px] font-semibold tracking-[-0.03em] leading-[1.05] mt-3 mb-8">
          Agent {id}
        </h1>
        <Agent id={Number(id)} explorer="https://testnet.monadexplorer.com" />
      </main>
      <Footer />
    </>
  );
}
