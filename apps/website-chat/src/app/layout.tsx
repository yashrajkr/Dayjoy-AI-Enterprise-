import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistrar } from "@/components/sw-registrar";
import { ThemeInit } from "@/components/theme-init";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dayjoy AI — Live Chat",
    template: "%s · Dayjoy AI",
  },
  description:
    "Dayjoy AI live customer support chat widget — instant answers, product help, and human handoff.",
  applicationName: "Dayjoy AI Live Chat",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dayjoy Chat",
  },
  openGraph: {
    title: "Dayjoy AI — Live Chat",
    description:
      "Instant AI-powered customer support for Dayjoy AI customers. Get answers in seconds.",
    type: "website",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="application-name" content="Dayjoy Chat" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
        {/* Set the theme class before paint to avoid a flash of the
            wrong theme on first load. */}
        <ThemeInit />
      </head>
      <body
        className={`${inter.variable} bg-background font-sans text-foreground antialiased`}
      >
        <Providers>
          {children}
          <ServiceWorkerRegistrar />
        </Providers>
      </body>
    </html>
  );
}
