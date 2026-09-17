import type { Metadata } from "next";
import Agents from "./Agents";
export const metadata: Metadata = { title: "Agents" };
export default function Page() { return <Agents />; }
