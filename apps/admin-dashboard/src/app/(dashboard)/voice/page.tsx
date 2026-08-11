"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Bot,
  Clock,
  TrendingUp,
  Activity,
  Plus,
  Settings as SettingsIcon,
  TestTube,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/layout/page-header";
import {
  voiceApi,
  type VoiceAssistant,
  type VoiceSession,
  type VoiceAnalyticsSummary,
} from "@/lib/api";

const statusVariant: Record<string, BadgeProps["variant"]> = {
  ringing: "live",
  answered: "success",
  in_progress: "success",
  completed: "secondary",
  failed: "destructive",
  missed: "warning",
  escalated: "default",
};

const directionIcons: Record<string, React.ElementType> = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  web: PhoneCall,
  transfer: PhoneOutgoing,
  callback: PhoneOutgoing,
};

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function VoiceDashboardPage() {
  const [assistants, setAssistants] = useState<VoiceAssistant[]>([]);
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [analytics, setAnalytics] = useState<VoiceAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [asstRes, sessRes, analRes] = await Promise.all([
        voiceApi.listAssistants(),
        voiceApi.listSessions({ limit: 10 }),
        voiceApi.getAnalyticsSummary(30).catch(() => null),
      ]);
      setAssistants(asstRes);
      setSessions(sessRes.sessions);
      if (analRes) setAnalytics(analRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load voice dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = analytics
    ? [
        {
          label: "Total Calls (30d)",
          value: analytics.total_calls,
          sub: `${(analytics.completion_rate * 100).toFixed(1)}% completion`,
          icon: PhoneCall,
        },
        {
          label: "Avg Duration",
          value: Math.floor(analytics.avg_duration_seconds),
          format: (v: number) => `${Math.floor(v / 60)}m ${Math.floor(v % 60)}s`,
          sub: "per call",
          icon: Clock,
        },
        {
          label: "AI Latency",
          value: Math.round(analytics.avg_ai_latency_ms),
          format: (v: number) => `${v}ms`,
          sub: "avg response time",
          icon: Activity,
        },
        {
          label: "Barge-ins",
          value: analytics.barge_ins,
          sub: `${analytics.escalations} escalations`,
          icon: TrendingUp,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Phone}
        title="Voice AI"
        description="Real-time voice conversations powered by STT → AI → TTS streaming"
        actions={
          <>
            <Link href="/voice/test">
              <Button variant="outline" size="sm">
                <TestTube className="mr-2 h-4 w-4" />
                Test Call
              </Button>
            </Link>
            <Link href="/voice/assistants">
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Assistant
              </Button>
            </Link>
            <Link href="/voice/settings">
              <Button variant="glass" size="icon">
                <SettingsIcon className="h-4 w-4" />
              </Button>
            </Link>
          </>
        }
      />

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {/* Analytics summary */}
      {analytics && (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          {kpis.map((kpi) => (
            <motion.div key={kpi.label} variants={item}>
              <Card interactive>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                  <div className="rounded-lg bg-white/[0.04] p-2">
                    <kpi.icon className="h-4 w-4 text-cyan" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="font-mono text-2xl font-semibold text-foreground">
                    {kpi.format ? kpi.format(kpi.value) : <AnimatedNumber value={kpi.value} />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Assistants */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-indigo" />
                Assistants
              </span>
              <Link href="/voice/assistants" className="text-xs text-cyan hover:underline">
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-white/[0.04]" />
                ))}
              </div>
            ) : assistants.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No assistants yet"
                action={
                  <Link href="/voice/assistants">
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Assistant
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2">
                {assistants.slice(0, 5).map((a) => (
                  <Link
                    key={a.id}
                    href={`/voice/assistants/${a.id}`}
                    className="block rounded-lg border border-white/[0.06] p-3 transition-colors hover:border-white/[0.14] hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.assistant_type} · {a.language}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {a.is_default && <Badge variant="secondary">Default</Badge>}
                        {a.provider_assistant_id ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-warning" />
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent sessions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-indigo" />
                Recent Calls
              </span>
              <Link href="/voice/sessions" className="text-xs text-cyan hover:underline">
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-white/[0.04]" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <EmptyState
                icon={Phone}
                title="No calls yet"
                action={
                  <Link href="/voice/test">
                    <Button size="sm" variant="outline">
                      <TestTube className="mr-2 h-4 w-4" />
                      Start Test Call
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => {
                  const DirIcon = directionIcons[s.direction] || Phone;
                  return (
                    <Link
                      key={s.id}
                      href={`/voice/sessions/${s.id}`}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3 transition-colors hover:border-white/[0.14] hover:bg-white/[0.03]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-white/[0.04] p-1.5">
                          <DirIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {s.caller_phone || s.caller_name || "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.direction} · {s.turn_count} turns · {s.duration_seconds}s
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.outcome && (
                          <Badge variant="outline" className="text-xs">
                            {s.outcome}
                          </Badge>
                        )}
                        <Badge variant={statusVariant[s.status] ?? "secondary"}>{s.status}</Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Outcome breakdown */}
      {analytics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outcomes (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {Object.entries(analytics.outcomes).map(([outcome, count]) => (
                <div key={outcome} className="rounded-lg bg-white/[0.02] py-3 text-center">
                  <p className="font-mono text-2xl font-semibold text-foreground">
                    <AnimatedNumber value={count} />
                  </p>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                    {outcome === "null" ? "in progress" : outcome}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
