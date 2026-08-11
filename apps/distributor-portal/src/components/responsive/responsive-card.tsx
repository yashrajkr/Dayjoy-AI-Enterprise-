"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ResponsiveCard — a Card wrapper whose padding + heading sizes
 * scale down on mobile and up on desktop, so cards never feel cramped
 * on a phone or oversized on a 4K monitor.
 *
 * The same `<ResponsiveCard>` can be used standalone, or its
 * sub-components (`Header`, `Title`, `Description`, `Content`,
 * `Footer`) for full layout flexibility.
 *
 * ```tsx
 * <ResponsiveCard interactive>
 *   <ResponsiveCard.Header>
 *     <ResponsiveCard.Title>Revenue</ResponsiveCard.Title>
 *     <ResponsiveCard.Description>Last 30 days</ResponsiveCard.Description>
 *   </ResponsiveCard.Header>
 *   <ResponsiveCard.Content>
 *     <Chart />
 *   </ResponsiveCard.Content>
 * </ResponsiveCard>
 * ```
 *
 * The `interactive` flag adds a hover ring + lift.
 */
export interface ResponsiveCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds a hover ring + lift — use for clickable cards. */
  interactive?: boolean;
  /** Padding preset: `compact` (p-3 sm:p-4), `default` (p-4 sm:p-6),
   *  `comfortable` (p-5 sm:p-8). */
  padding?: "compact" | "default" | "comfortable";
}

const PADDING_CLASS: Record<NonNullable<ResponsiveCardProps["padding"]>, string> = {
  compact: "p-3 sm:p-4",
  default: "p-4 sm:p-6",
  comfortable: "p-5 sm:p-8",
};

function ResponsiveCard({
  className,
  interactive = false,
  padding = "default",
  ...props
}: ResponsiveCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-shadow",
        "sm:rounded-2xl",
        interactive &&
          "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

function Header({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1 sm:space-y-1.5", PADDING_CLASS.default, className)}
      {...props}
    />
  );
}

function Title({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl",
        className,
      )}
      {...props}
    />
  );
}

function Description({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs text-muted-foreground sm:text-sm", className)}
      {...props}
    />
  );
}

function Content({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(PADDING_CLASS.default, "pt-0", className)} {...props} />
  );
}

function Footer({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2", PADDING_CLASS.default, "pt-0", className)}
      {...props}
    />
  );
}

ResponsiveCard.Header = Header;
ResponsiveCard.Title = Title;
ResponsiveCard.Description = Description;
ResponsiveCard.Content = Content;
ResponsiveCard.Footer = Footer;

ResponsiveCard.displayName = "ResponsiveCard";
Header.displayName = "ResponsiveCard.Header";
Title.displayName = "ResponsiveCard.Title";
Description.displayName = "ResponsiveCard.Description";
Content.displayName = "ResponsiveCard.Content";
Footer.displayName = "ResponsiveCard.Footer";

export { ResponsiveCard };
