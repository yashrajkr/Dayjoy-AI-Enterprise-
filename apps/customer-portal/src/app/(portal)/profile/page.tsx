"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  User as UserIcon,
  MapPin,
  FileText,
  Shield,
  Settings,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState } from "@/components/shared/states";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";
import type { Customer } from "@/types/customer.types";
import { PersonalDetailsTab } from "@/components/profile/personal-details-tab";
import { AddressTab } from "@/components/profile/address-tab";
import { DocumentsTab } from "@/components/profile/documents-tab";
import { SecurityTab } from "@/components/profile/security-tab";
import { PreferencesTab } from "@/components/profile/preferences-tab";

const TABS = [
  { value: "personal", label: "Personal", icon: UserIcon },
  { value: "address", label: "Address", icon: MapPin },
  { value: "documents", label: "Documents", icon: FileText },
  { value: "security", label: "Security", icon: Shield },
  { value: "preferences", label: "Preferences", icon: Settings },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default function ProfilePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabValue>("personal");

  const customerQuery = useQuery({
    queryKey: user?.customerId
      ? QUERY_KEYS.customerProfile(user.customerId)
      : QUERY_KEYS.customer,
    queryFn: () =>
      api.get<Customer>(
        `/customers/${user?.customerId ?? user?.id ?? "me"}`,
      ),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  if (customerQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My Profile"
          description="Manage your personal information, addresses, and preferences."
        />
        <LoadingState label="Loading your profile…" />
      </div>
    );
  }

  // Fall back to the auth user if the customer endpoint hasn't been wired.
  const customer: Customer | null =
    customerQuery.data ??
    (user
      ? ({
          id: user.customerId ?? user.id,
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
          rewardPoints: user.rewardPoints ?? 0,
          addresses: [],
          documents: [],
          preferences: {
            language: "en",
            currency: "INR",
            notifications: {
              email: true,
              sms: false,
              whatsapp: false,
              push: true,
            },
            marketing: {
              promotionalEmails: true,
              productUpdates: true,
              smsOffers: false,
              personalizedRecommendations: true,
            },
            newsletter: true,
          },
        } as Customer)
      : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Manage your personal information, addresses, and preferences."
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabValue)}
        className="w-full"
      >
        <div className="overflow-x-auto">
          <TabsList className="w-full justify-start sm:w-auto">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="personal">
          <PersonalDetailsTab customer={customer} />
        </TabsContent>
        <TabsContent value="address">
          <AddressTab
            customerId={customer?.id ?? ""}
            addresses={customer?.addresses ?? []}
          />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab
            customerId={customer?.id ?? ""}
            documents={customer?.documents ?? []}
          />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab
            twoFactorEnabled={user?.twoFactorEnabled ?? false}
            customerId={customer?.id ?? ""}
          />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab
            customerId={customer?.id ?? ""}
            preferences={customer?.preferences ?? null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
