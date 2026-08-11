"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Shield,
  Smartphone,
  Monitor,
  LogOut,
  Lock,
  KeyRound,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { CustomerSession } from "@/types/customer.types";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Include at least one uppercase letter")
      .regex(/[a-z]/, "Include at least one lowercase letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

export function SecurityTab({
  twoFactorEnabled,
  customerId,
}: {
  twoFactorEnabled: boolean;
  customerId: string;
}) {
  const [twoFA, setTwoFA] = useState(twoFactorEnabled);

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["customer", customerId, "sessions"],
    queryFn: () => api.get<CustomerSession[]>(`/customers/${customerId}/sessions`),
    staleTime: 30 * 1000,
  });

  const changePasswordMutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      api.post(`/customers/${customerId}/change-password`, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      toast.success("Password changed", {
        description: "Use your new password next time you sign in.",
      });
      passwordForm.reset();
    },
    onError: (err) =>
      toast.error("Change failed", { description: getErrorMessage(err) }),
  });

  const toggle2FAMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch(`/customers/${customerId}/preferences`, {
        twoFactorEnabled: enabled,
      }),
    onMutate: (enabled) => setTwoFA(enabled),
    onSuccess: (_, enabled) =>
      toast.success(enabled ? "2FA enabled" : "2FA disabled"),
    onError: (err, _enabled) => {
      setTwoFA(!twoFA);
      toast.error("Toggle failed", { description: getErrorMessage(err) });
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/customers/${customerId}/sessions/${id}`),
    onSuccess: () => {
      toast.success("Session revoked");
      sessionsQuery.refetch();
    },
    onError: (err) =>
      toast.error("Revoke failed", { description: getErrorMessage(err) }),
  });

  const onSubmit = (values: PasswordValues) =>
    changePasswordMutation.mutateAsync(values);

  return (
    <div className="space-y-6">
      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={passwordForm.handleSubmit(onSubmit)}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...passwordForm.register("currentPassword")}
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.currentPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...passwordForm.register("newPassword")}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...passwordForm.register("confirmPassword")}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button
                type="submit"
                variant="gradient"
                loading={passwordForm.formState.isSubmitting}
              >
                <KeyRound className="h-4 w-4" /> Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Two-factor authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Authenticator app verification
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                Add an extra layer of security. We&apos;ll ask for a code
                from your authenticator app when you sign in.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={twoFA ? "success" : "secondary"} className="text-[10px]">
              {twoFA ? "Enabled" : "Disabled"}
            </Badge>
            <Switch
              checked={twoFA}
              onCheckedChange={(v) => toggle2FAMutation.mutate(v)}
              disabled={toggle2FAMutation.isPending}
              aria-label="Toggle two-factor authentication"
            />
          </div>
        </CardContent>
      </Card>

      {/* Active sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4" /> Active Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessionsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : sessionsQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              Could not load active sessions.
            </p>
          ) : !sessionsQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">
              No active sessions found.
            </p>
          ) : (
            <ul className="space-y-2">
              {sessionsQuery.data.map((session) => (
                <li
                  key={session.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-border p-3",
                    session.isCurrent && "border-primary/30 bg-primary/5",
                  )}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Monitor className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {session.device}
                      {session.isCurrent && (
                        <Badge variant="default" className="text-[10px]">
                          This device
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {session.browser ?? "Browser"} ·{" "}
                      {session.os ?? "OS"} · {session.ipAddress}
                      {session.location ? ` · ${session.location}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70">
                      Active {formatRelativeTime(session.lastActiveAt)}
                    </p>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => revokeSessionMutation.mutate(session.id)}
                    >
                      <LogOut className="h-3.5 w-3.5" /> Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
