import Link from "next/link";
import Footer from "@/components/Footer";
import { FilmPlayer } from "@/components/Film";
import { FILMS, type FilmKey } from "@/lib/films";

/* a film's own page: the film, and the two ways on. the address of this page
   is what goes into a submission form. */
export default function FilmPage({ film }: { film: FilmKey }) {
  const f = FILMS[film];
  const other: FilmKey = film === "walkthrough" ? "launch" : "walkthrough";
  const o = FILMS[other];
  return (
    <>
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-5 pt-6 sm:pt-8 pb-16 min-w-0">
        {/* the film is the page. no eyebrow, headline or sentence over it: the
            film says all of that itself. the name stays for screen readers and
            in the tab and the link preview, which come from the metadata */}
        <h1 className="sr-only">{f.title}, {f.length}</h1>
        <FilmPlayer film={film} />
        <div className="flex flex-wrap items-center gap-2 mt-6">
          <Link href="/demo" className="drawn-btn btn-orange" style={{ padding: "12px 22px", fontSize: "0.93rem" }}>Try it on testnet</Link>
          <Link href={o.path} className="drawn-btn btn-gold" style={{ padding: "12px 20px", fontSize: "0.93rem" }}>Watch {o.title.toLowerCase()}</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
