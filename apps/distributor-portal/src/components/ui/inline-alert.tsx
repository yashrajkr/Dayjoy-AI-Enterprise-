import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineAlertProps {
  variant?: "error" | "success" | "info" | "warning";
  children: React.ReactNode;
  className?: string;
}

const styles = {
  error: "border-destructive/25 bg-destructive/10 text-destructive",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  info: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

const icons = {
  error: XCircle,
  success: CheckCircle2,
  info: Info,
  warning: AlertCircle,
};

export function InlineAlert({ variant = "info", children, className }: InlineAlertProps) {
  const Icon = icons[variant];
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        styles[variant],
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
