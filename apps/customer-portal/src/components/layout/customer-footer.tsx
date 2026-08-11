"use client";

import Link from "next/link";
import {
  Sparkles,
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Youtube,
} from "lucide-react";
import { APP_NAME_FULL, FOOTER_LINKS, SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/constants";

const SOCIAL_ICONS = [
  { Icon: Facebook, href: "#", label: "Facebook" },
  { Icon: Twitter, href: "#", label: "Twitter" },
  { Icon: Instagram, href: "#", label: "Instagram" },
  { Icon: Linkedin, href: "#", label: "LinkedIn" },
  { Icon: Youtube, href: "#", label: "YouTube" },
];

/**
 * Customer footer — links grid, contact info, social icons, and the
 * sticky-bottom copyright row. Used inside the `(portal)` layout so
 * the footer sticks to the bottom of the viewport when content is
 * short and pushes down naturally when it overflows (see
 * `customer-layout.tsx`'s `min-h-screen flex flex-col` wrapper).
 */
export function CustomerFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card/40">
      <div className="container mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-5">
          {/* Brand + contact */}
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient shadow-glow">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-semibold tracking-tight">
                Dayjoy
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              AI-powered commerce and support — built to make every
              customer feel taken care of.
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="hover:text-foreground"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" />
                <a
                  href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
                  className="hover:text-foreground"
                >
                  {SUPPORT_PHONE}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" />
                <span>Bengaluru, India</span>
              </li>
            </ul>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                {col.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {APP_NAME_FULL}. All rights
            reserved.
          </p>
          <div className="flex items-center gap-2">
            {SOCIAL_ICONS.map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Icon className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
