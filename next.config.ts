import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Cloudflare quick tunnel hostnames during dev (URL changes per session).
  // Add more entries (or a LAN IP) here if you tunnel via another provider.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
