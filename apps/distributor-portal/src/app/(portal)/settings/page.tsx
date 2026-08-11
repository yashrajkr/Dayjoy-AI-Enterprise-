"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Bell,
  Globe,
  Lock,
  Palette,
  Settings as SettingsIcon,
  Shield,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { InlineAlert } from "@/components/ui/inline-alert";
import { DEFAULT_SETTINGS } from "@/lib/mock-data";
import { NOTIFICATION_TYPE_LABELS, STORAGE_KEYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { UserSettings } from "@/types";

const THEMES = [
  { value: "light", label: "Light", description: "Bright, high-contrast surface." },
  { value: "dark", label: "Dark", description: "Easy on the eyes for night work." },
  { value: "brand", label: "Brand", description: "Dayjoy warm orange theme." },
] as const;

const LANGUAGES = [
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "हिंदी (Hindi)" },
  { value: "ta-IN", label: "தமிழ் (Tamil)" },
  { value: "te-IN", label: "తెలుగు (Telugu)" },
  { value: "kn-IN", label: "ಕನ್ನಡ (Kannada)" },
  { value: "mr-IN", label: "मराठी (Marathi)" },
  { value: "bn-IN", label: "বাংলা (Bengali)" },
];

const DATE_FORMATS = [
  { value: "DD MMM YYYY", label: "12 Aug 2026" },
  { value: "MM/DD/YYYY", label: "08/12/2026" },
  { value: "DD-MM-YYYY", label: "12-08-2026" },
  { value: "YYYY-MM-DD", label: "2026-08-12" },
];

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India (IST, UTC+5:30)" },
  { value: "Asia/Dubai", label: "Dubai (GST, UTC+4)" },
  { value: "Asia/Singapore", label: "Singapore (SGT, UTC+8)" },
  { value: "America/New_York", label: "New York (EST, UTC-5)" },
  { value: "Europe/London", label: "London (GMT, UTC+0)" },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch {
        /* ignore */
      }
    }
  }, []);

  const persist = (next: UserSettings) => {
    setSettings(next);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
  };

  const setChannel = (channel: keyof UserSettings["notifications"]["channels"], value: boolean) => {
    persist({
      ...settings,
      notifications: {
        ...settings.notifications,
        channels: { ...settings.notifications.channels, [channel]: value },
      },
    });
    toast.success(`${channel} notifications ${value ? "enabled" : "disabled"}.`);
  };

  const setCategory = (
    cat: keyof UserSettings["notifications"]["categories"],
    value: boolean,
  ) => {
    persist({
      ...settings,
      notifications: {
        ...settings.notifications,
        categories: { ...settings.notifications.categories, [cat]: value },
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Customize your portal experience."
        icon={SettingsIcon}
      />

      <Tabs defaultValue="theme">
        <TabsList className="flex-wrap">
          <TabsTrigger value="theme">
            <Palette className="h-3.5 w-3.5" />
            Theme
          </TabsTrigger>
          <TabsTrigger value="language">
            <Globe className="h-3.5 w-3.5" />
            Language
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-3.5 w-3.5" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="privacy">
            <Shield className="h-3.5 w-3.5" />
            Privacy
          </TabsTrigger>
        </TabsList>

        {/* Theme */}
        <TabsContent value="theme">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4 text-primary" />
                Theme
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    setTheme(t.value);
                    persist({ ...settings, theme: t.value });
                    toast.success(`Switched to ${t.label} theme.`);
                  }}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left transition-colors",
                    theme === t.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <div
                    className={cn(
                      "mb-3 h-16 w-full rounded-md",
                      t.value === "light" && "bg-gradient-to-br from-orange-50 to-white",
                      t.value === "dark" && "bg-gradient-to-br from-slate-900 to-slate-700",
                      t.value === "brand" && "bg-gradient-to-br from-orange-100 to-orange-300",
                    )}
                  />
                  <p className="font-semibold text-foreground">{t.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.description}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Language */}
        <TabsContent value="language">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4 text-primary" />
                Language & region
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select
                    value={settings.language}
                    onValueChange={(v) => {
                      persist({ ...settings, language: v });
                      toast.success("Language preference saved.");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date format</Label>
                  <Select
                    value={settings.dateFormat}
                    onValueChange={(v) =>
                      persist({ ...settings, dateFormat: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FORMATS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Timezone</Label>
                  <Select
                    value={settings.timezone}
                    onValueChange={(v) =>
                      persist({ ...settings, timezone: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 text-primary" />
                Notification channels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(settings.notifications.channels).map(([channel, enabled]) => (
                <div
                  key={channel}
                  className="flex items-center justify-between border-b border-border py-2 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium capitalize text-foreground">
                      {channel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Receive notifications via {channel}.
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) =>
                      setChannel(
                        channel as keyof UserSettings["notifications"]["channels"],
                        v,
                      )
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(settings.notifications.categories).map(([cat, enabled]) => (
                <div
                  key={cat}
                  className="flex items-center justify-between border-b border-border py-2 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {NOTIFICATION_TYPE_LABELS[cat.toUpperCase()] ?? cat}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Get notified about {cat.toLowerCase()} activity.
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) =>
                      setCategory(
                        cat as keyof UserSettings["notifications"]["categories"],
                        v,
                      )
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Privacy */}
        <TabsContent value="privacy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-primary" />
                Profile visibility
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between border-b border-border py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Profile visible to other distributors
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your name and tier will appear in the team directory.
                  </p>
                </div>
                <Switch
                  checked={settings.privacy.profileVisible}
                  onCheckedChange={(v) =>
                    persist({
                      ...settings,
                      privacy: { ...settings.privacy, profileVisible: v },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Contact info visible
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Allow team members to see your email and phone.
                  </p>
                </div>
                <Switch
                  checked={settings.privacy.contactInfoVisible}
                  onCheckedChange={(v) =>
                    persist({
                      ...settings,
                      privacy: { ...settings.privacy, contactInfoVisible: v },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data & account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Download my data
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Get a copy of your profile, orders, and activity.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    toast.success(
                      "Data export requested. You'll receive an email when it's ready.",
                    )
                  }
                >
                  Request export
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Privacy policy
                  </p>
                  <p className="text-xs text-muted-foreground">
                    How Dayjoy collects, uses, and protects your data.
                  </p>
                </div>
                <Button variant="outline" asChild>
                  <a href="/knowledge/privacy-policy">Read policy</a>
                </Button>
              </div>
              <Separator />
              <InlineAlert variant="warning">
                Account deletion is permanent and cannot be undone.
              </InlineAlert>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-destructive">
                    Delete account
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Permanently remove your account and all associated data.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() =>
                    toast.error(
                      "Account deletion requires verification. Please contact support.",
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  Delete account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
