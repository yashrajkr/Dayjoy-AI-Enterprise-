"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  PhoneIncoming,
  PhoneCall,
  PhoneMissed,
  Clock,
  TrendingUp,
  Activity,
  AlertCircle,
  Loader2,
  Plus,
  Settings as SettingsIcon,
  RefreshCw,
  CheckCircle,
  Bot,
  PhoneForwarded,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  telephonyApi,
  type PhoneNumber,
  type TelephonyCallSession,
  type TelephonyAnalyticsSummary,
} from "@/lib/api";

export default function TelephonyDashboardPage() {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [activeCalls, setActiveCalls] = useState<TelephonyCallSession[]>([]);
  const [analytics, setAnalytics] = useState<TelephonyAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [phones, active, anal] = await Promise.all([
        telephonyApi.listPhoneNumbers(),
        telephonyApi.listActiveCalls(),
        telephonyApi.getAnalyticsSummary(30).catch(() => null),
      ]);
      setPhoneNumbers(phones);
      setActiveCalls(active);
      if (anal) setAnalytics(anal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load telephony dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Telephony</h1>
          <p className="text-sm text-muted-foreground">
            Connect real phone numbers to the Voice AI platform
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/telephony/phone-numbers">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Number
            </Button>
          </Link>
          <Link href="/telephony/settings">
            <Button variant="outline" size="sm">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Analytics summary */}
      {analytics && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls (30d)</CardTitle>
              <PhoneCall className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.total_calls}</div>
              <p className="text-xs text-muted-foreground">
                {(analytics.answer_rate * 100).toFixed(1)}% answer rate
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Missed Calls</CardTitle>
              <PhoneMissed className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.missed_calls}</div>
              <p className="text-xs text-muted-foreground">
                {((analytics.missed_calls / Math.max(analytics.total_calls, 1)) * 100).toFixed(1)}% of total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">AI Resolution</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(analytics.ai_resolution_rate * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">{analytics.ai_handled} AI-handled</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.floor(analytics.avg_duration_seconds / 60)}m {Math.floor(analytics.avg_duration_seconds % 60)}s
              </div>
              <p className="text-xs text-muted-foreground">
                {(analytics.human_transfer_rate * 100).toFixed(1)}% transfer rate
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Active calls */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Active Calls ({activeCalls.length})
              </span>
              <Link href="/telephony/calls" className="text-xs text-cyan hover:underline">
                View history
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/70" />
              </div>
            ) : activeCalls.length === 0 ? (
              <div className="py-8 text-center">
                <PhoneCall className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No active calls</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeCalls.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3"
                  >
                    <div className="flex items-center gap-3">
                      <PhoneIncoming className="h-4 w-4 text-success animate-pulse" />
                      <div>
                        <p className="text-sm font-medium">
                          {c.caller_name || c.from_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          → {c.to_number} · {c.direction}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{c.routing_decision}</Badge>
                      <Badge className="border border-success/25 bg-success/10 text-success">{c.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phone numbers */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <PhoneIncoming className="h-5 w-5" />
                Phone Numbers
              </span>
              <Link href="/telephony/phone-numbers" className="text-xs text-cyan hover:underline">
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/70" />
              </div>
            ) : phoneNumbers.length === 0 ? (
              <div className="py-8 text-center">
                <PhoneIncoming className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No phone numbers</p>
                <Link href="/telephony/phone-numbers">
                  <Button className="mt-3" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Register Number
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {phoneNumbers.slice(0, 5).map((p) => (
                  <div key={p.id} className="rounded-lg border border-white/[0.06] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{p.number}</p>
                      {p.is_verified ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : (
                        <Badge variant="outline" className="text-xs">Unverified</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.display_name}</p>
                    <div className="mt-1 flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">{p.routing_strategy}</Badge>
                      {p.recording_enabled && (
                        <Badge variant="outline" className="text-xs">REC</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Link href="/telephony/phone-numbers">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <PhoneIncoming className="mx-auto h-6 w-6 text-cyan" />
              <p className="mt-2 text-xs font-medium">Phone Numbers</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/telephony/calls">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <PhoneCall className="mx-auto h-6 w-6 text-success" />
              <p className="mt-2 text-xs font-medium">Call History</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/telephony/recordings">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <Activity className="mx-auto h-6 w-6 text-indigo" />
              <p className="mt-2 text-xs font-medium">Recordings</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/telephony/routing">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <PhoneForwarded className="mx-auto h-6 w-6 text-warning" />
              <p className="mt-2 text-xs font-medium">Routing Rules</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/telephony/business-hours">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <Clock className="mx-auto h-6 w-6 text-cyan-500" />
              <p className="mt-2 text-xs font-medium">Business Hours</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/telephony/settings">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <SettingsIcon className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs font-medium">Settings</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
