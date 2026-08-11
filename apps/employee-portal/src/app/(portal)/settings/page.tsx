"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Personalise your portal experience."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Light or dark — your call.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Theme</Label>
              <div className="flex gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("light")}
                >
                  <Sun className="h-4 w-4" /> Light
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="h-4 w-4" /> Dark
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Choose what you get pinged about.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "New ticket assigned to me", on: true },
              { label: "Task due today", on: true },
              { label: "New lead assigned", on: true },
              { label: "Team announcements", on: true },
              { label: "@mentions in chat", on: true },
              { label: "Weekly digest email", on: false },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between text-sm"
              >
                <span>{row.label}</span>
                <Button
                  variant={row.on ? "default" : "outline"}
                  size="sm"
                  onClick={() => toast.info("Notification preference saved")}
                >
                  {row.on ? "On" : "Off"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Session and security.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Change password</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("A reset link has been emailed.")}
              >
                Send reset link
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span>Sign out of all sessions</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => logout()}
              >
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
