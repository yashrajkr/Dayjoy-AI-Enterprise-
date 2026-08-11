import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: [
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-toast",
    "@radix-ui/react-tabs",
    "@radix-ui/react-separator",
    "@radix-ui/react-label",
    "@radix-ui/react-avatar",
    "@radix-ui/react-slot",
    "@radix-ui/react-select",
    "@radix-ui/react-switch",
    "@radix-ui/react-progress",
    "@radix-ui/react-popover",
    "@radix-ui/react-scroll-area",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-tooltip",
    "react-day-picker",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion"],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
