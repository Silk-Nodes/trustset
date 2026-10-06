import type { Metadata } from "next";
import FilmPage from "@/components/FilmPage";

const title = "The walkthrough";
const description = "trustset on Monad testnet, recorded at real speed: an app refusing a switched off agent, then every layer, each ending on its transaction.";
const image = { url: "/media/walkthrough-og.jpg", width: 1200, height: 630, alt: "trustset, The walkthrough" };

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/walkthrough" },
  openGraph: { title: `${title} · trustset`, description, url: "/walkthrough", type: "video.other", images: [image], videos: [{ url: "/media/trustset-walkthrough.mp4", type: "video/mp4", width: 1920, height: 1080 }] },
  twitter: { card: "summary_large_image", title: `${title} · trustset`, description, images: [image.url] },
};

export default function Page() {
  return <FilmPage film="walkthrough" />;
}
