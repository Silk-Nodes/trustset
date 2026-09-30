import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";
const here = dirname(fileURLToPath(import.meta.url));
/* same deploy shape as argus and tx: next start on a port behind caddy. */
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: { unoptimized: true },
  turbopack: { root: here },
  /* a content security policy that closes what can be closed without nonces:
     no script from another origin, no plugins, no framing, no <base> or form
     hijack. inline scripts stay allowed because next's bootstrap is inline;
     connections stay open to any https or wss, because the rpc, dynamic and the
     wallet each choose their own hosts. dev adds eval for the hot reloader. */
  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: wss:" + (dev ? " ws:" : ""),
      "frame-src https:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    /* report only until the dynamic email sign-in has been seen working under
       it in production, where it is the one flow local cannot exercise. every
       page and the rest of the app were checked clean under enforcement.
       framing is already refused by the proxy's x-frame-options. */
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy-Report-Only", value: csp }] }];
  },
  /* the owner's page was /console for a day. links from that day still land. */
  async redirects() {
    return [
      { source: "/console", destination: "/agents", permanent: true },
      { source: "/console/:path*", destination: "/agents/:path*", permanent: true },
    ];
  },
};
export default nextConfig;
