import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineAlertProps {
  variant?: "error" | "success" | "info";
  children: React.ReactNode;
  className?: string;
}

const styles = {
  error: "border-destructive/25 bg-destructive/10 text-destructive",
  success: "border-success/25 bg-success/10 text-success",
  info: "border-cyan/25 bg-cyan/10 text-cyan",
};

const icons = { error: AlertCircle, success: CheckCircle2, info: Info };

export function InlineAlert({ variant = "info", children, className }: InlineAlertProps) {
  const Icon = icons[variant];
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
        styles[variant],
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
