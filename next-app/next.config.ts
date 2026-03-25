import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence the Turbopack webpack conflict as recommended by the build TIP
  // @ts-ignore
  turbopack: {},
};

export default nextConfig;
