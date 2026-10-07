import type { Metadata } from "next";
import Stats from "./Stats";

export const metadata: Metadata = { title: "Visits", robots: { index: false, follow: false } };

export default function Page() {
  return <Stats />;
}
