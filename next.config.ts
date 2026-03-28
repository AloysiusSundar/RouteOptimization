import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence the Turbopack webpack conflict as recommended by the build TIP
  // @ts-ignore
  turbopack: {},
  async rewrites() {
    // Only rewrite in development mode (local server)
    if (process.env.NODE_ENV !== 'production') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://127.0.0.1:8080/api/:path*',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
