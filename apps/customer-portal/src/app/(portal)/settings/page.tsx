"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  MapPin,
  Bell,
  Shield,
  Globe,
  Palette,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useAppTheme } from "@/hooks/use-theme";
import { useThemeStore } from "@/store/theme.store";
import { CURRENCIES, LANGUAGES } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SETTINGS_LINKS = [
  {
    icon: User,
    title: "Personal details",
    description: "Update your name, email, phone, and avatar.",
    href: "/profile?tab=personal",
  },
  {
    icon: MapPin,
    title: "Addresses",
    description: "Manage shipping and billing addresses.",
    href: "/profile?tab=address",
  },
  {
    icon: Shield,
    title: "Security",
    description: "Change your password, 2FA, and active sessions.",
    href: "/profile?tab=security",
  },
  {
    icon: Bell,
    title: "Notifications & marketing",
    description: "Choose how we contact you and what we send.",
    href: "/profile?tab=preferences",
  },
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme, mounted } = useAppTheme();
  const storeTheme = useThemeStore((s) => s.theme);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account, appearance, and preferences in one place."
      />

      {/* Quick links to profile tabs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SETTINGS_LINKS.map(({ icon: Icon, title, description, href }) => (
          <Card key={title} interactive>
            <button
              onClick={() => router.push(href)}
              className="flex w-full items-start gap-3 p-5 text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {description}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </Card>
        ))}
      </div>

      {/* Appearance */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Appearance</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose how the portal looks. System follows your device preference.
          </p>
          <div className="flex flex-wrap gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                disabled={!mounted}
                className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  (mounted ? theme : storeTheme) === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Localization quick picks */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Language & Currency</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Quick picks — full control is in your profile preferences.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <Select defaultValue="en">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <Select defaultValue="INR">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.symbol} {c.code} — {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Changes here are saved to your profile preferences.{" "}
            <Link
              href="/profile?tab=preferences"
              className="text-primary hover:underline"
            >
              Manage preferences →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
