import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's client assets (JS bundles, HMR, RSC payloads) to be
  // fetched when the app is opened from another device on the LAN (e.g. a phone
  // at http://192.168.1.35:3000). Without this, Next.js blocks these
  // cross-origin dev requests and the page renders but never hydrates — every
  // button appears but is unresponsive. Dev-only; has no effect on production.
  allowedDevOrigins: ["192.168.1.35"],
};

export default nextConfig;
