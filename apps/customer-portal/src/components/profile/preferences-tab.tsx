"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  Mail,
  MessageSquare,
  MessageCircle,
  Smartphone,
  Megaphone,
  Globe,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { QUERY_KEYS, LANGUAGES, CURRENCIES } from "@/lib/constants";
import type { CustomerPreferences } from "@/types/customer.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NOTIFICATION_CHANNELS = [
  {
    key: "email" as const,
    label: "Email",
    icon: Mail,
    description: "Order updates, receipts, and account alerts.",
  },
  {
    key: "sms" as const,
    label: "SMS",
    icon: Smartphone,
    description: "Time-sensitive alerts via text message.",
  },
  {
    key: "whatsapp" as const,
    label: "WhatsApp",
    icon: MessageCircle,
    description: "Chat with our AI and get updates on WhatsApp.",
  },
  {
    key: "push" as const,
    label: "Push",
    icon: Bell,
    description: "Browser and mobile push notifications.",
  },
];

const MARKETING_OPTS = [
  {
    key: "promotionalEmails" as const,
    label: "Promotional emails",
    description: "Deals, seasonal offers, and discount codes.",
  },
  {
    key: "productUpdates" as const,
    label: "Product updates",
    description: "New arrivals and restocks for brands you follow.",
  },
  {
    key: "smsOffers" as const,
    label: "SMS offers",
    description: "Occasional text-only flash sale alerts.",
  },
  {
    key: "personalizedRecommendations" as const,
    label: "Personalised recommendations",
    description: "AI-curated product picks based on your activity.",
  },
];

export function PreferencesTab({
  customerId,
  preferences,
}: {
  customerId: string;
  preferences: CustomerPreferences | null;
}) {
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<CustomerPreferences>(
    preferences ?? {
      language: "en",
      currency: "INR",
      notifications: { email: true, sms: false, whatsapp: false, push: true },
      marketing: {
        promotionalEmails: true,
        productUpdates: true,
        smsOffers: false,
        personalizedRecommendations: true,
      },
      newsletter: true,
    },
  );

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<CustomerPreferences>) =>
      api.patch(`/customers/${customerId}/preferences`, patch),
    onSuccess: () => {
      toast.success("Preferences saved");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customer });
    },
    onError: (err) =>
      toast.error("Save failed", { description: getErrorMessage(err) }),
  });

  const setNotif = (key: keyof CustomerPreferences["notifications"], v: boolean) =>
    setLocal((p) => ({
      ...p,
      notifications: { ...p.notifications, [key]: v },
    }));

  const setMarketing = (
    key: keyof CustomerPreferences["marketing"],
    v: boolean,
  ) =>
    setLocal((p) => ({
      ...p,
      marketing: { ...p.marketing, [key]: v },
    }));

  const dirty =
    JSON.stringify(local) !== JSON.stringify(preferences ?? local);

  return (
    <div className="space-y-6">
      {/* Localization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" /> Language & Currency
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <Select
              value={local.language}
              onValueChange={(v) => setLocal((p) => ({ ...p, language: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Currency</label>
            <Select
              value={local.currency}
              onValueChange={(v) => setLocal((p) => ({ ...p, currency: v }))}
            >
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
        </CardContent>
      </Card>

      {/* Notification channels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" /> Notification Channels
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {NOTIFICATION_CHANNELS.map(({ key, label, icon: Icon, description }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg py-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </div>
              <Switch
                checked={local.notifications[key]}
                onCheckedChange={(v) => setNotif(key, v)}
                aria-label={`Toggle ${label} notifications`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Marketing preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4" /> Marketing Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {MARKETING_OPTS.map(({ key, label, description }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg py-3"
            >
              <div className="pr-4">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={local.marketing[key]}
                onCheckedChange={(v) => setMarketing(key, v)}
                aria-label={`Toggle ${label}`}
              />
            </div>
          ))}
          <Separator className="my-3" />
          <div className="flex items-center justify-between rounded-lg py-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Newsletter</p>
                <p className="text-xs text-muted-foreground">
                  Our monthly digest of products, stories, and tips.
                </p>
              </div>
            </div>
            <Switch
              checked={local.newsletter}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, newsletter: v }))}
              aria-label="Toggle newsletter subscription"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="gradient"
          disabled={!dirty}
          loading={updateMutation.isPending}
          onClick={() => updateMutation.mutate(local)}
        >
          Save preferences
        </Button>
      </div>
    </div>
  );
}
