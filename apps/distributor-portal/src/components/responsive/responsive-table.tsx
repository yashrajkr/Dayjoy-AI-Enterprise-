"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/mobile";

/**
 * ResponsiveTable — renders a normal HTML table on desktop, and a
 * stack of "label: value" cards on mobile (so users don't have to
 * scroll horizontally on a phone).
 *
 * Usage:
 * ```tsx
 * <ResponsiveTable
 *   columns={[{ key: "name", header: "Name" }, { key: "email", header: "Email" }]}
 *   rows={[
 *     { id: "1", name: "Alice", email: "alice@x.com" },
 *     { id: "2", name: "Bob",   email: "bob@x.com" },
 *   ]}
 *   getRowId={(r) => r.id}
 *   onRowClick={(r) => router.push(`/users/${r.id}`)}
 * />
 * ```
 *
 * Accessibility:
 *  - Desktop: real `<table>` with `<thead>` + `<th scope="col">`.
 *  - Mobile: cards are `<article>` with `<dt>`/`<dd>` description
 *    lists so screen readers announce the label/value pairs.
 */
export interface ResponsiveTableColumn<T> {
  /** Unique key — must match a property on the row. */
  key: string;
  /** Header label. */
  header: React.ReactNode;
  /** Custom cell renderer. */
  render?: (row: T) => React.ReactNode;
  /** Hide this column on mobile cards. */
  hideOnMobile?: boolean;
  /** Hide this column on the desktop table. */
  hideOnDesktop?: boolean;
  /** Optional className for both `<th>` and `<dt>`. */
  className?: string;
  /** Right-align numeric columns. */
  align?: "left" | "right" | "center";
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Optional empty-state node rendered when `rows.length === 0`. */
  emptyState?: React.ReactNode;
  /** Sticky header on desktop scroll containers. */
  stickyHeader?: boolean;
  /** Extra className for the desktop `<table>`. */
  className?: string;
  /** Extra className for the mobile card stack wrapper. */
  mobileClassName?: string;
  /** Show row index on mobile cards (e.g. "#1", "#2"). */
  showIndexOnMobile?: boolean;
}

export function ResponsiveTable<T extends Record<string, unknown>>({
  columns,
  rows,
  getRowId,
  onRowClick,
  emptyState,
  stickyHeader = true,
  className,
  mobileClassName,
  showIndexOnMobile = true,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  if (isMobile) {
    return (
      <div
        className={cn("space-y-3", mobileClassName)}
        role="list"
        aria-label="Data list"
      >
        {rows.map((row, idx) => {
          const id = getRowId(row);
          const visible = columns.filter((c) => !c.hideOnMobile);
          return (
            <article
              key={id}
              role="listitem"
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onRowClick(row);
                }
              }}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                "rounded-xl border border-border bg-card p-4 shadow-sm",
                onRowClick &&
                  "cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {showIndexOnMobile && (
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  #{idx + 1}
                </div>
              )}
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2">
                {visible.map((col) => (
                  <React.Fragment key={col.key}>
                    <dt
                      className={cn(
                        "text-xs font-medium uppercase tracking-wide text-muted-foreground",
                        col.className,
                      )}
                    >
                      {col.header}
                    </dt>
                    <dd
                      className={cn(
                        "text-sm text-foreground",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.className,
                      )}
                    >
                      {col.render
                        ? col.render(row)
                        : (row[col.key] as React.ReactNode) ?? "—"}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          "w-full border-collapse text-sm",
          className,
        )}
      >
        <thead>
          <tr
            className={cn(
              "border-b border-border",
              stickyHeader && "sticky top-0 z-10 bg-card",
            )}
          >
            {columns
              .filter((c) => !c.hideOnDesktop)
              .map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            return (
              <tr
                key={id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
                className={cn(
                  "border-b border-border/60 transition-colors",
                  onRowClick &&
                    "cursor-pointer hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                )}
              >
                {columns
                  .filter((c) => !c.hideOnDesktop)
                  .map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-foreground",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.className,
                      )}
                    >
                      {col.render
                        ? col.render(row)
                        : (row[col.key] as React.ReactNode) ?? "—"}
                    </td>
                  ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
