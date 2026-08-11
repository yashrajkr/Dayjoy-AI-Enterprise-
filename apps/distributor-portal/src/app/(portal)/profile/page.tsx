"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  Building2,
  CreditCard,
  FileText,
  IdCard,
  Lock,
  MapPin,
  Shield,
  Upload,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { profileService } from "@/lib/services";
import { TIER_COMMISSION_RATES } from "@/lib/constants";
import { cn, formatDate, getInitials } from "@/lib/utils";
import type { ProfileDocument } from "@/types";

export default function ProfilePage() {
  const queryClient = useQueryClient();

  const { data: profile, isLoading, isError, error } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileService.get(),
  });

  const personalMutation = useMutation({
    mutationFn: (payload: Partial<NonNullable<typeof profile>>) =>
      profileService.updatePersonal(payload),
    onSuccess: () => {
      toast.success("Personal details saved.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => toast.error("Failed to save."),
  });

  const bankMutation = useMutation({
    mutationFn: (payload: NonNullable<NonNullable<typeof profile>["bankAccount"]>) =>
      profileService.updateBank(payload),
    onSuccess: () => {
      toast.success("Bank details saved.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => toast.error("Failed to save."),
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      profileService.changePassword(payload),
    onSuccess: () => toast.success("Password updated."),
    onError: () => toast.error("Failed to update password."),
  });

  const uploadDocMutation = useMutation({
    mutationFn: ({ type, file }: { type: ProfileDocument["type"]; file: File }) =>
      profileService.uploadDocument(type, file),
    onSuccess: () => {
      toast.success("Document uploaded.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => toast.error("Upload failed."),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <InlineAlert variant="error">
        Failed to load profile: {(error as Error)?.message ?? "Unknown error"}.
      </InlineAlert>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Manage your personal, business, bank, and security details."
        icon={User}
      />

      <Tabs defaultValue="personal">
        <TabsList className="flex-wrap">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* Personal */}
        <TabsContent value="personal">
          <PersonalTab
            profile={profile}
            onSave={(payload) => personalMutation.mutate(payload)}
            pending={personalMutation.isPending}
          />
        </TabsContent>

        {/* Business */}
        <TabsContent value="business">
          <BusinessTab profile={profile} />
        </TabsContent>

        {/* Bank */}
        <TabsContent value="bank">
          <BankTab
            profile={profile}
            onSave={(payload) => bankMutation.mutate(payload)}
            pending={bankMutation.isPending}
          />
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <DocumentsTab
            profile={profile}
            onUpload={(args) => uploadDocMutation.mutate(args)}
            pending={uploadDocMutation.isPending}
          />
        </TabsContent>

        {/* Security */}
        <TabsContent value="security">
          <SecurityTab
            onSavePassword={(payload) => passwordMutation.mutate(payload)}
            pending={passwordMutation.isPending}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Profile = NonNullable<ReturnType<typeof useProfileType>>;
function useProfileType() {
  return null as unknown as {
    id: string;
    distributorCode: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    avatarUrl: string | null;
    dateOfBirth: string | null;
    tier: string;
    joinDate: string;
    sponsorName: string;
    businessName: string | null;
    taxId: string | null;
    panNumber: string | null;
    gstNumber: string | null;
    bankAccount: {
      accountHolder: string;
      accountNumber: string;
      ifsc: string;
      bankName: string;
      branch: string;
    } | null;
    address: {
      line1: string;
      city: string;
      state: string;
      pincode: string;
      country: string;
    } | null;
    documents: ProfileDocument[];
  };
}

function PersonalTab({
  profile,
  onSave,
  pending,
}: {
  profile: Profile;
  onSave: (payload: Partial<Profile>) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    dateOfBirth: profile.dateOfBirth ?? "",
    addressLine1: profile.address?.line1 ?? "",
    city: profile.address?.city ?? "",
    state: profile.address?.state ?? "",
    pincode: profile.address?.pincode ?? "",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="h-4 w-4 text-primary" />
          Personal details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">
              {getInitials(`${profile.firstName} ${profile.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-foreground">
              {profile.firstName} {profile.lastName}
            </p>
            <p className="text-xs text-muted-foreground">
              Distributor code: {profile.distributorCode}
            </p>
            <Button variant="outline" size="sm" className="mt-2">
              <Upload className="h-3.5 w-3.5" />
              Change photo
            </Button>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" id="firstName" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
          <Field label="Last name" id="lastName" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
          <Field label="Email" id="email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Phone" id="phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="Date of birth" id="dob" type="date" value={form.dateOfBirth} onChange={(v) => setForm({ ...form, dateOfBirth: v })} />
        </div>

        <Separator />

        <div>
          <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Address
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Address line 1" id="addr1" value={form.addressLine1} onChange={(v) => setForm({ ...form, addressLine1: v })} />
            </div>
            <Field label="City" id="city" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Field label="State" id="state" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
            <Field label="Pincode" id="pincode" value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => onSave(form)}
            loading={pending}
            disabled={pending}
          >
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BusinessTab({ profile }: { profile: Profile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" />
          Business details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoField label="Distributor code" value={profile.distributorCode} icon={IdCard} />
          <InfoField
            label="Tier"
            value={
              <div className="flex items-center gap-2">
                <Badge variant="default">{profile.tier}</Badge>
                <span className="text-xs text-muted-foreground">
                  {TIER_COMMISSION_RATES[profile.tier]}% commission rate
                </span>
              </div>
            }
          />
          <InfoField label="Join date" value={formatDate(profile.joinDate)} icon={BadgeCheck} />
          <InfoField label="Sponsor" value={profile.sponsorName} />
          <InfoField label="Business name" value={profile.businessName ?? "—"} />
          <InfoField label="PAN number" value={profile.panNumber ?? "—"} />
          <InfoField label="Tax ID" value={profile.taxId ?? "—"} />
          <InfoField label="GST number" value={profile.gstNumber ?? "—"} />
        </div>
      </CardContent>
    </Card>
  );
}

function BankTab({
  profile,
  onSave,
  pending,
}: {
  profile: Profile;
  onSave: (payload: NonNullable<Profile["bankAccount"]>) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    accountHolder: profile.bankAccount?.accountHolder ?? "",
    accountNumber: profile.bankAccount?.accountNumber ?? "",
    ifsc: profile.bankAccount?.ifsc ?? "",
    bankName: profile.bankAccount?.bankName ?? "",
    branch: profile.bankAccount?.branch ?? "",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-primary" />
          Bank details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <InlineAlert variant="info">
          Bank details are used for commission payouts. Verify carefully —
          incorrect details may delay your monthly payout.
        </InlineAlert>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account holder name" id="ah" value={form.accountHolder} onChange={(v) => setForm({ ...form, accountHolder: v })} />
          <Field label="Account number" id="an" value={form.accountNumber} onChange={(v) => setForm({ ...form, accountNumber: v })} />
          <Field label="IFSC code" id="ifsc" value={form.ifsc} onChange={(v) => setForm({ ...form, ifsc: v })} />
          <Field label="Bank name" id="bn" value={form.bankName} onChange={(v) => setForm({ ...form, bankName: v })} />
          <div className="sm:col-span-2">
            <Field label="Branch" id="br" value={form.branch} onChange={(v) => setForm({ ...form, branch: v })} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => onSave(form)} loading={pending} disabled={pending}>
            Save bank details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentsTab({
  profile,
  onUpload,
  pending,
}: {
  profile: Profile;
  onUpload: (args: { type: ProfileDocument["type"]; file: File }) => void;
  pending: boolean;
}) {
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const docTypes: { type: ProfileDocument["type"]; label: string }[] = [
    { type: "ID_PROOF", label: "ID Proof" },
    { type: "ADDRESS_PROOF", label: "Address Proof" },
    { type: "BANK_PROOF", label: "Bank Proof" },
    { type: "PHOTO", label: "Passport Photo" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Uploaded documents
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {profile.documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {doc.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {doc.type.replace(/_/g, " ")} · Uploaded{" "}
                    {formatDate(doc.uploadedAt)}
                  </p>
                </div>
                {doc.verified ? (
                  <Badge variant="success">
                    <BadgeCheck className="h-3 w-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="warning">Pending verification</Badge>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload new document</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {docTypes.map((dt) => (
              <div
                key={dt.type}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {dt.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, JPG, PNG · max 5MB
                  </p>
                </div>
                <input
                  ref={(el) => {
                    fileRefs.current[dt.type] = el;
                  }}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload({ type: dt.type, file });
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  loading={pending}
                  onClick={() => fileRefs.current[dt.type]?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityTab({
  onSavePassword,
  pending,
}: {
  onSavePassword: (payload: { currentPassword: string; newPassword: string }) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }
    if (form.newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    onSavePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-primary" />
            Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Current password"
                  id="cp"
                  type="password"
                  value={form.currentPassword}
                  onChange={(v) => setForm({ ...form, currentPassword: v })}
                />
              </div>
              <Field
                label="New password"
                id="np"
                type="password"
                value={form.newPassword}
                onChange={(v) => setForm({ ...form, newPassword: v })}
              />
              <Field
                label="Confirm new password"
                id="cnp"
                type="password"
                value={form.confirmPassword}
                onChange={(v) => setForm({ ...form, confirmPassword: v })}
              />
            </div>
            {error && <InlineAlert variant="error">{error}</InlineAlert>}
            <div className="flex justify-end">
              <Button type="submit" loading={pending} disabled={pending}>
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            Two-factor authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                Authenticator app
              </p>
              <p className="text-xs text-muted-foreground">
                Use Google Authenticator, Authy, or similar.
              </p>
            </div>
            <Button variant="outline">Enable</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Chrome · Bengaluru, India
                </p>
                <p className="text-xs text-muted-foreground">
                  Current session · Last active now
                </p>
              </div>
              <Badge variant="success" dot>
                Active
              </Badge>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Safari · iPhone 14
                </p>
                <p className="text-xs text-muted-foreground">
                  Last active 2 hours ago
                </p>
              </div>
              <Button variant="ghost" size="sm">
                Revoke
              </Button>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Helpers =====

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function InfoField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: typeof User;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
