import type { Metadata } from "next";
import FilmPage from "@/components/FilmPage";

const title = "The launch film";
const description = "The trust stack for AI agents, in forty seconds.";
const image = { url: "/media/launch-og.jpg", width: 1200, height: 630, alt: "trustset, The launch film" };

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/launch" },
  openGraph: { title: `${title} · trustset`, description, url: "/launch", type: "video.other", images: [image], videos: [{ url: "/media/trustset-launch.mp4", type: "video/mp4", width: 1920, height: 1080 }] },
  twitter: { card: "summary_large_image", title: `${title} · trustset`, description, images: [image.url] },
};

export default function Page() {
  return <FilmPage film="launch" />;
}
