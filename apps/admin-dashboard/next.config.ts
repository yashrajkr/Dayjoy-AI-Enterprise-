import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const nextConfig: NextConfig = {
  // Standalone output for Docker — produces a self-contained bundle.
  output: "standalone",

  // Catch potential issues early in development.
  reactStrictMode: true,

  // Transpile radix packages that ship untranspiled ESM.
  transpilePackages: [
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-toast",
    "@radix-ui/react-tabs",
    "@radix-ui/react-separator",
    "@radix-ui/react-label",
    "@radix-ui/react-avatar",
    "@radix-ui/react-slot",
  ],

  experimental: {
    // Optimize package imports to reduce bundle size.
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion"],
    // Type-safe `<Link href>` — emits a build error on broken routes.
    typedRoutes: true,
  },

  // Only expose NEXT_PUBLIC_* to the client.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },

  // Dev-only API proxy — in production, use a real reverse proxy (Caddy/nginx).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/:path*`,
      },
    ];
  },

  // Security headers applied to every route.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "**.gravatar.com" },
    ],
  },
};

export default nextConfig;
