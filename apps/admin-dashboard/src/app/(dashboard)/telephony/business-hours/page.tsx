"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Clock,
  Plus,
  AlertCircle,
  Loader2,
  RefreshCw,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { telephonyApi, type BusinessHours } from "@/lib/api";

const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function BusinessHoursPage() {
  const [schedules, setSchedules] = useState<BusinessHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [afterHoursStrategy, setAfterHoursStrategy] = useState("voicemail");
  const [afterHoursMessage, setAfterHoursMessage] = useState("We're currently closed. Please call back during business hours.");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await telephonyApi.listBusinessHours();
      setSchedules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load business hours");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    try {
      setCreating(true);
      const weeklySchedule: Record<string, { enabled: boolean; start: string; end: string }> = {};
      for (const day of days) {
        weeklySchedule[day] = { enabled: day !== "saturday" && day !== "sunday", start: "09:00", end: "18:00" };
      }
      await telephonyApi.createBusinessHours({
        name,
        timezone,
        weekly_schedule: weeklySchedule,
        after_hours_strategy: afterHoursStrategy,
        after_hours_message: afterHoursMessage,
      });
      setCreateOpen(false);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create schedule");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Business Hours</h1>
          <p className="text-sm text-muted-foreground">
            Define when your business is open — used by routing rules
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Business Hours Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name">Schedule Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Default Hours" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tz">Timezone</Label>
                <select
                  id="tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="after">After-Hours Strategy</Label>
                <select
                  id="after"
                  value={afterHoursStrategy}
                  onChange={(e) => setAfterHoursStrategy(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="voicemail">Voicemail</option>
                  <option value="forward">Forward to another number</option>
                  <option value="ai">AI (handle 24/7)</option>
                  <option value="reject">Reject (busy signal)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="msg">After-Hours Message</Label>
                <Textarea
                  id="msg"
                  value={afterHoursMessage}
                  onChange={(e) => setAfterHoursMessage(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Default schedule: Mon-Fri 09:00-18:00, closed Sat-Sun. Edit the JSON after creation for custom hours.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !name.trim()}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
        </div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No business hours schedules</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {schedules.map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-medium">{s.name}</p>
                      {s.is_default && (
                        <Badge className="border border-warning/25 bg-warning/10 text-warning">
                          <Star className="mr-1 h-3 w-3" />
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.timezone}</p>
                  </div>
                  <Badge variant="secondary">{s.after_hours_strategy}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-2">
                  {days.map((day) => {
                    const daySchedule = (s.weekly_schedule as Record<string, { enabled: boolean; start: string; end: string }>)?.[day];
                    const enabled = daySchedule?.enabled ?? false;
                    return (
                      <div
                        key={day}
                        className={`rounded-md border p-2 text-center text-xs ${
                          enabled ? "border-success/25 bg-success/10" : "border-white/[0.08] bg-white/[0.03]"
                        }`}
                      >
                        <p className="font-medium capitalize">{day.slice(0, 3)}</p>
                        {enabled ? (
                          <p className="text-muted-foreground">{daySchedule.start} - {daySchedule.end}</p>
                        ) : (
                          <p className="text-muted-foreground/70">Closed</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {s.after_hours_message && (
                  <p className="mt-3 text-sm text-muted-foreground italic">
                    &quot;{s.after_hours_message}&quot;
                  </p>
                )}
                {s.holidays && s.holidays.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {s.holidays.length} holiday(s) configured
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
