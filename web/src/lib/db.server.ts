import { Pool } from "pg";

/* the index, read side.
 *
 * the app and the database sit on the same machine, so the page reads postgres
 * directly. a second http service between a page and a socket on localhost
 * would be ceremony.
 *
 * DATABASE_URL is absent on a laptop, where postgres is not reachable at all
 * because it listens on the vm's loopback. every caller therefore has to cope
 * with no index, and the explorer says so rather than looking broken. */
declare global { var __trustsetPool: Pool | undefined }

export function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  /* next reloads modules in development; one pool, kept on the global, or each
     reload opens another handful of connections and postgres runs out. */
  globalThis.__trustsetPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 30_000 });
  return globalThis.__trustsetPool;
}

export const INDEXED = () => !!process.env.DATABASE_URL;
