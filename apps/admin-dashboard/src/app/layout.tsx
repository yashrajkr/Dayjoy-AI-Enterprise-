import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Dayjoy AI Enterprise — Admin Dashboard",
  description:
    "Enterprise AI platform for Voice AI, WhatsApp AI, RAG, CRM, and Analytics",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('dayjoy-theme');
                  if (theme === 'light') {
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={2500}
          toastOptions={{
            style: {
              // Push well below the 64px sticky header AND the first metric row
              marginTop: "96px",
              marginRight: "20px",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              boxShadow: "0 12px 32px -8px rgba(0,0,0,0.4)",
            },
            classNames: {
              description: "!text-subtle",
            },
          }}
          containerStyle={{
            // Above header (z-30), sidebar (z-40), and modals (z-50)
            zIndex: 99999,
          }}
        />
      </body>
    </html>
  );
}
