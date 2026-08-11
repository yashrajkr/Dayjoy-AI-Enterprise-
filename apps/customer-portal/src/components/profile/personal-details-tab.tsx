"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, User as UserIcon } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";
import { getInitials } from "@/lib/utils";
import type { Customer, Gender } from "@/types/customer.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const personalSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(10, "Enter a valid phone number"),
  dateOfBirth: z.string().optional(),
  gender: z
    .enum(["male", "female", "other", "prefer_not_to_say"])
    .optional(),
});

type PersonalValues = z.infer<typeof personalSchema>;

export function PersonalDetailsTab({ customer }: { customer: Customer | null }) {
  const { user, setUser } = useAuth();
  const queryClient = useQueryClient();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fullName =
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ||
    "Customer";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<PersonalValues>({
    resolver: zodResolver(personalSchema),
    values: {
      firstName: customer?.firstName ?? "",
      lastName: customer?.lastName ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      dateOfBirth: customer?.dateOfBirth ?? "",
      gender: customer?.gender,
    },
  });

  const gender = watch("gender");

  const updateMutation = useMutation({
    mutationFn: (values: PersonalValues) =>
      api.put<Customer>(
        `/customers/${customer?.id ?? user?.id}`,
        values,
      ),
    onSuccess: (updated) => {
      toast.success("Profile updated", {
        description: "Your personal details have been saved.",
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customer });
      if (user) {
        setUser({
          ...user,
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email,
          phone: updated.phone,
        });
      }
    },
    onError: (err) =>
      toast.error("Update failed", { description: getErrorMessage(err) }),
  });

  const onSubmit = (values: PersonalValues) =>
    updateMutation.mutateAsync(values);

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !customer) return;
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.raw.post<{ url: string }>(
        `/customers/${customer.id}/avatar`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      const avatarUrl = res.data.url;
      await api.put(`/customers/${customer.id}`, { avatarUrl });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customer });
      toast.success("Avatar updated");
      if (user) setUser({ ...user, avatarUrl });
    } catch (err) {
      toast.error("Upload failed", { description: getErrorMessage(err) });
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Personal Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-20 w-20 border-2 border-border">
              {customer?.avatarUrl && (
                <AvatarImage src={customer.avatarUrl} alt={fullName} />
              )}
              <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
            <label
              htmlFor="avatar-upload"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent"
              aria-label="Change avatar"
            >
              {uploadingAvatar ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onAvatarChange}
              disabled={uploadingAvatar}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{fullName}</p>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, or GIF. Max 2MB.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" {...register("firstName")} />
            {errors.firstName && (
              <p className="text-xs text-destructive">
                {errors.firstName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" {...register("lastName")} />
            {errors.lastName && (
              <p className="text-xs text-destructive">
                {errors.lastName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" {...register("phone")} />
            {errors.phone && (
              <p className="text-xs text-destructive">
                {errors.phone.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of birth</Label>
            <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={gender ?? undefined}
              onValueChange={(v) => setValue("gender", v as Gender)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
                <SelectItem value="prefer_not_to_say">
                  Prefer not to say
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="submit" variant="gradient" loading={isSubmitting}>
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
