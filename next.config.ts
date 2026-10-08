import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // ETL-only native module — не бандлить в Worker
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

initOpenNextCloudflareForDev();
