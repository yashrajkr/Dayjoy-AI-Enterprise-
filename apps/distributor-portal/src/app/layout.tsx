import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistrar } from "@/components/sw-registrar";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dayjoy Distributor Portal",
    template: "%s | Dayjoy Distributor Portal",
  },
  description:
    "Dayjoy AI Enterprise — Distributor Portal. Manage leads, customers, products, orders, training, and your AI business assistant in one place.",
  applicationName: "Dayjoy Distributor Portal",
  authors: [{ name: "Dayjoy AI" }],
  keywords: [
    "Dayjoy",
    "distributor",
    "MLM",
    "direct sales",
    "leads",
    "customers",
    "orders",
    "commissions",
    "AI assistant",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dayjoy Distributor",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f97316" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e1a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="application-name" content="Dayjoy Distributor" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
      </head>
      <body
        className={`${geist.variable} bg-background font-sans text-foreground antialiased`}
      >
        <Providers>
          {children}
          <ServiceWorkerRegistrar />
        </Providers>
      </body>
    </html>
  );
}
