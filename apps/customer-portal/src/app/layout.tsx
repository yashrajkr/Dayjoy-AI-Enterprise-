import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistrar } from "@/components/sw-registrar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dayjoy AI — Customer Portal",
    template: "%s | Dayjoy AI Customer Portal",
  },
  description:
    "Dayjoy AI customer self-service portal — products, orders, AI assistance, and support.",
  applicationName: "Dayjoy AI Customer Portal",
  authors: [{ name: "Dayjoy AI" }],
  keywords: [
    "Dayjoy",
    "customer portal",
    "AI assistant",
    "support",
    "orders",
    "products",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dayjoy Customer",
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
        <meta name="application-name" content="Dayjoy Customer" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
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
