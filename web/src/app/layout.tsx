import type { Metadata } from "next";
import { DM_Mono } from "next/font/google";
import Header from "@/components/Header";
import { WalletProvider } from "@/components/WalletProvider";
import SiteBackdrop from "@/components/SiteBackdrop";
import "./globals.css";

const dmMono = DM_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-dm-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "trustset · An off switch for AI agents", template: "%s · trustset" },
  description: "An off switch for AI agents on Monad. One transaction from a cold key, and every app that checks refuses the agent in the next block. Built by Silk Nodes.",
  metadataBase: new URL("https://trustset.silknodes.io"),
  applicationName: "trustset",
  authors: [{ name: "Silk Nodes", url: "https://silknodes.io" }],
  openGraph: { title: "trustset · An off switch for AI agents", description: "One transaction from a cold key, and every app that checks refuses the agent in the next block.", url: "https://trustset.silknodes.io", siteName: "trustset · by silk nodes", type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image", title: "trustset · An off switch for AI agents", creator: "@silk_nodes", site: "@silk_nodes" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`h-full antialiased ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        {/* theme resolved before first paint, same script as argus */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem("theme");if(t!=="dark"&&t!=="light"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})();` }} />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
      </head>
      <body className="min-h-full flex flex-col">
        <WalletProvider>
        <SiteBackdrop />
        {/* everything paints above the fixed backdrop, on every page, not only
            the one that used to own it. */}
        <div className="relative" style={{ zIndex: 1 }}>
          <Header />
          {children}
        </div>
        </WalletProvider>
      </body>
    </html>
  );
}
