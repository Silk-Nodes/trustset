import type { Metadata } from "next";
import FilmPage from "@/components/FilmPage";

const title = "Built with Dynamic";
const description = "The owner signs in with an email and Dynamic makes the wallet; the live agent signs through a Dynamic MPC server wallet.";
const image = { url: "/media/dynamic-og.jpg", width: 1200, height: 630, alt: "trustset × Dynamic" };

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/dynamic" },
  openGraph: { title: `${title} · trustset`, description, url: "/dynamic", type: "video.other", images: [image], videos: [{ url: "/media/trustset-dynamic.mp4", type: "video/mp4", width: 1920, height: 1080 }] },
  twitter: { card: "summary_large_image", title: `${title} · trustset`, description, images: [image.url] },
};

export default function Page() {
  return <FilmPage film="dynamic" />;
}
