"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useEmployee } from "@/hooks/use-employee";
import { getInitials, formatDate } from "@/lib/utils";

export default function ProfilePage() {
  const { employee } = useEmployee();
  const [form, setForm] = useState({
    firstName: employee?.firstName ?? "",
    lastName: employee?.lastName ?? "",
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    jobTitle: employee?.jobTitle ?? "",
    bio: "",
  });

  const handleSave = () => {
    toast.success("Profile saved");
  };

  return (
    <>
      <PageHeader
        title="My profile"
        description="Manage your personal info and bio."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How you appear in the portal.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-lg">
                {getInitials(
                  employee?.fullName ??
                    `${employee?.firstName ?? ""} ${employee?.lastName ?? ""}`,
                )}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">
                {employee?.fullName ??
                  `${employee?.firstName ?? ""} ${employee?.lastName ?? ""}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {employee?.email}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {employee?.role && (
                <Badge variant="secondary">
                  {employee.role.replace(/_/g, " ").toLowerCase()}
                </Badge>
              )}
              {employee?.department && (
                <Badge variant="outline">
                  {employee.department.toLowerCase()}
                </Badge>
              )}
            </div>
            <Separator />
            <dl className="w-full space-y-1 text-left text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Employee ID</dt>
                <dd className="font-mono">{employee?.id ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Joined</dt>
                <dd>{employee?.createdAt ? formatDate(employee.createdAt) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Last login</dt>
                <dd>
                  {employee?.lastLoginAt
                    ? formatDate(employee.lastLoginAt)
                    : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Edit details</CardTitle>
            <CardDescription>Update your contact info.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="jobTitle">Job title</Label>
                <Input
                  id="jobTitle"
                  value={form.jobTitle}
                  onChange={(e) =>
                    setForm({ ...form, jobTitle: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  rows={4}
                  placeholder="Tell your team a bit about yourself…"
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave}>Save changes</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
