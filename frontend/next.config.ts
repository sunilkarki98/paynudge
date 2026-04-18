import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy all /api/* requests to the Express server in development.
  // In production, a reverse proxy (nginx/Caddy) handles this routing.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${process.env.API_PORT || 4000}/api/:path*`,
      },
    ]
  },
};

export default nextConfig;
