"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ResponsiveForm — a `<form>` whose fields stack to a single column
 * on mobile and flow into a 2-column grid on tablet+.
 *
 * Pass any number of `<ResponsiveFormField>` children. Each field
 * controls its own span on the grid via the `span` prop (1 or 2 cols).
 *
 * ```tsx
 * <ResponsiveForm onSubmit={...}>
 *   <ResponsiveFormField label="First name" span={1}>
 *     <Input ... />
 *   </ResponsiveFormField>
 *   <ResponsiveFormField label="Last name" span={1}>
 *     <Input ... />
 *   </ResponsiveFormField>
 *   <ResponsiveFormField label="Address" span={2}>
 *     <Textarea ... />
 *   </ResponsiveFormField>
 * </ResponsiveForm>
 * ```
 *
 * Accessibility:
 *  - Every field renders a real `<label htmlFor>` bound to the input
 *    via the `htmlFor` prop (or auto-generated id).
 *  - Optional `error` and `hint` text are linked via `aria-describedby`.
 *  - The form element itself has `role="form"` and accepts `aria-label`.
 */
export interface ResponsiveFormProps
  extends React.FormHTMLAttributes<HTMLFormElement> {
  /** Number of columns at the desktop breakpoint (1, 2, 3, or 4). */
  columns?: 1 | 2 | 3 | 4;
  /** Gap between fields, Tailwind class (default `gap-4`). */
  gapClassName?: string;
}

export function ResponsiveForm({
  columns = 2,
  gapClassName = "gap-4",
  className,
  children,
  ...rest
}: ResponsiveFormProps) {
  const colsClass = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];

  return (
    <form
      role="form"
      className={cn("w-full", className)}
      {...rest}
    >
      <div
        className={cn(
          "grid grid-cols-1 gap-y-4",
          colsClass,
          // Column gap (between adjacent fields on tablet+) comes from
          // `gapClassName` (default `gap-4`); row gap is `gap-y-4` above.
          gapClassName,
        )}
      >
        {children}
      </div>
    </form>
  );
}

export interface ResponsiveFormFieldProps {
  label: React.ReactNode;
  /** How many grid columns this field should span at desktop. */
  span?: 1 | 2 | 3 | 4;
  /** Optional helper text shown under the input. */
  hint?: React.ReactNode;
  /** Error message — when set, the field is marked `aria-invalid`. */
  error?: React.ReactNode;
  /** Required marker (`*`) is shown when true. */
  required?: boolean;
  /** Optional `htmlFor` for the label. If omitted, an id is generated. */
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

let _fieldIdCounter = 0;
void _fieldIdCounter; // reserved for future use

export function ResponsiveFormField({
  label,
  span = 1,
  hint,
  error,
  required = false,
  htmlFor,
  className,
  children,
}: ResponsiveFormFieldProps) {
  const autoId = React.useId();
  const id = htmlFor ?? autoId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  // Span at desktop breakpoint.
  const spanClass = {
    1: "sm:col-span-1",
    2: "sm:col-span-2",
    3: "sm:col-span-2 lg:col-span-3",
    4: "sm:col-span-2 lg:col-span-4",
  }[span];

  // Clone the child input to wire `id`, `aria-describedby`, `aria-invalid`, `aria-required`.
  const child = React.Children.only(children) as React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    "aria-required"?: boolean;
  }>;
  const enhancedChild = React.cloneElement(child, {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required || undefined,
  });

  return (
    <div className={cn(spanClass, className)}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {enhancedChild}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
