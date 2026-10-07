import type { Metadata } from "next";
import FilmPage from "@/components/FilmPage";

const title = "The pitch";
const description = "Why AI agents need a stop that works outside their own app, and how trustset puts it on Monad.";
const image = { url: "/media/pitch-og.jpg", width: 1200, height: 630, alt: "trustset, The pitch" };

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pitch" },
  openGraph: { title: `${title} · trustset`, description, url: "/pitch", type: "video.other", images: [image], videos: [{ url: "/media/trustset-pitch.mp4", type: "video/mp4", width: 1920, height: 1080 }] },
  twitter: { card: "summary_large_image", title: `${title} · trustset`, description, images: [image.url] },
};

export default function Page() {
  return <FilmPage film="pitch" />;
}
