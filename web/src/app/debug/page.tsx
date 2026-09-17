import { notFound } from "next/navigation";
import Wallet from "./Wallet";

/* wallet diagnostics, development only.
 *
 * it signs and spends nothing, but it exists to dump raw provider errors and
 * that is not a thing to leave reachable by anyone who guesses the path on a
 * deployed site. nothing links to it either way; it is typed in by hand when a
 * connection misbehaves. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Wallet />;
}
