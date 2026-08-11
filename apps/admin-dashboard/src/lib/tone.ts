export type Tone = "brand" | "gold" | "info" | "success" | "warning" | "danger" | "violet" | "teal" | "muted";

export const toneText: Record<Tone, string> = {
  brand: "text-brand",
  gold: "text-gold",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  violet: "text-violet",
  teal: "text-teal",
  muted: "text-muted-foreground",
};

export const toneBgSoft: Record<Tone, string> = {
  brand: "bg-brand/12 text-brand border-brand/25",
  gold: "bg-gold/12 text-gold border-gold/25",
  info: "bg-info/12 text-info border-info/25",
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/12 text-warning border-warning/25",
  danger: "bg-danger/12 text-danger border-danger/25",
  violet: "bg-violet/12 text-violet border-violet/25",
  teal: "bg-teal/12 text-teal border-teal/25",
  muted: "bg-glass-strong text-muted-foreground border-border",
};

export const toneDot: Record<Tone, string> = {
  brand: "bg-brand",
  gold: "bg-gold",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  violet: "bg-violet",
  teal: "bg-teal",
  muted: "bg-subtle",
};

export const toneGradient: Record<Tone, string> = {
  brand: "bg-[linear-gradient(135deg,var(--brand),var(--gold))]",
  gold: "bg-[linear-gradient(135deg,var(--gold),var(--brand))]",
  info: "bg-[linear-gradient(135deg,var(--info),var(--violet))]",
  success: "bg-[linear-gradient(135deg,var(--success),var(--teal))]",
  warning: "bg-[linear-gradient(135deg,var(--warning),var(--gold))]",
  danger: "bg-[linear-gradient(135deg,var(--danger),var(--brand))]",
  violet: "bg-[linear-gradient(135deg,var(--violet),var(--info))]",
  teal: "bg-[linear-gradient(135deg,var(--teal),var(--success))]",
  muted: "bg-glass-strong",
};

export const toneVar: Record<Tone, string> = {
  brand: "var(--brand)",
  gold: "var(--gold)",
  info: "var(--info)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  violet: "var(--violet)",
  teal: "var(--teal)",
  muted: "var(--subtle)",
};
