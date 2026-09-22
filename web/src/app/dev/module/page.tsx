import { notFound } from "next/navigation";
import { Suspense } from "react";
import Preview from "./Preview";

/* a bench for the switchboard module, off in production.
 *
 * the console draws agents only behind a connected wallet, which a headless
 * browser does not have, so there was no way to measure a module with real
 * chain data. this page reads any owner's agents through public calls, draws
 * them as modules, and signs nothing. it does not exist on the deployed site. */
export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-5 pt-8 pb-16 min-w-0">
      <Suspense fallback={null}><Preview /></Suspense>
    </main>
  );
}
