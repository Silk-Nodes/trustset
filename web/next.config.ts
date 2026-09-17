import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";
const here = dirname(fileURLToPath(import.meta.url));
/* same deploy shape as argus and tx: next start on a port behind caddy. */
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: { unoptimized: true },
  turbopack: { root: here },
  /* the owner's page was /console for a day. links from that day still land. */
  async redirects() {
    return [
      { source: "/console", destination: "/agents", permanent: true },
      { source: "/console/:path*", destination: "/agents/:path*", permanent: true },
    ];
  },
};
export default nextConfig;
