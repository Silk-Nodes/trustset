import type { Metadata } from "next";
import FilmPage from "@/components/FilmPage";

const title = "Built with Mera";
const description = "One passkey, two keys: one pauses the agent, one seals its runbook through Mera.";
const image = { url: "/media/mera-og.jpg", width: 1200, height: 630, alt: "trustset × Mera" };

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/mera" },
  openGraph: { title: `${title} · trustset`, description, url: "/mera", type: "video.other", images: [image], videos: [{ url: "/media/trustset-mera.mp4", type: "video/mp4", width: 1920, height: 1080 }] },
  twitter: { card: "summary_large_image", title: `${title} · trustset`, description, images: [image.url] },
};

export default function Page() {
  return <FilmPage film="mera" />;
}
