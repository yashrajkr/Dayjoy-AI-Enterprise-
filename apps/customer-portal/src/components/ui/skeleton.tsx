import { cn } from "@/lib/utils";

/**
 * Skeleton — animated placeholder used by loading states. Renders a
 * shimmering bar; combine with `h-*`/`w-*` to size.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shimmer-bg rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
