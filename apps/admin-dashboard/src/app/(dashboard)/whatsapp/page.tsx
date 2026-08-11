"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  MessageCircle,
  MessageSquare,
  Bot,
  Users,
  Clock,
  TrendingUp,
  AlertCircle,
  Loader2,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Settings as SettingsIcon,
  Send,
  Inbox,
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
  whatsappApi,
  type WhatsAppAccount,
  type WhatsAppSession,
  type WhatsAppAnalyticsSummary,
} from "@/lib/api";

const sessionStatusColors: Record<string, string> = {
  active: "border border-success/25 bg-success/10 text-success",
  waiting_ai: "border border-cyan/25 bg-cyan/10 text-cyan",
  waiting_human: "border border-warning/25 bg-warning/10 text-warning",
  completed: "border border-white/10 bg-white/[0.06] text-muted-foreground",
  expired: "border border-white/10 bg-white/[0.06] text-muted-foreground",
  escalated: "border border-destructive/25 bg-destructive/10 text-destructive",
};

export default function WhatsAppDashboardPage() {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [analytics, setAnalytics] = useState<WhatsAppAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [accts, sess, anal] = await Promise.all([
        whatsappApi.listAccounts(),
        whatsappApi.listSessions({ limit: 10 }),
        whatsappApi.getAnalytics(30).catch(() => null),
      ]);
      setAccounts(accts);
      setSessions(sess.sessions);
      if (anal) setAnalytics(anal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load WhatsApp dashboard");
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">WhatsApp AI</h1>
          <p className="text-sm text-muted-foreground">
            Multi-tenant WhatsApp Business AI platform
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/whatsapp/conversations">
            <Button variant="outline" size="sm">
              <Inbox className="mr-2 h-4 w-4" />
              Inbox
            </Button>
          </Link>
          <Link href="/whatsapp/accounts">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Connect Account
            </Button>
          </Link>
          <Link href="/whatsapp/settings">
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

      {/* Analytics */}
      {analytics && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Conversations (30d)</CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.total_conversations}</div>
              <p className="text-xs text-muted-foreground">
                {(analytics.ai_resolution_rate * 100).toFixed(1)}% AI resolved
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Messages</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.inbound_messages + analytics.outbound_messages}</div>
              <p className="text-xs text-muted-foreground">
                {analytics.inbound_messages} in · {analytics.outbound_messages} out
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">AI Confidence</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(analytics.ai_avg_confidence * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Avg latency: {analytics.ai_avg_latency_ms.toFixed(0)}ms
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Handoffs</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.human_handoff_count}</div>
              <p className="text-xs text-muted-foreground">
                {(analytics.human_handoff_rate * 100).toFixed(1)}% handoff rate
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent conversations */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Recent Conversations
              </span>
              <Link href="/whatsapp/conversations" className="text-xs text-cyan hover:underline">
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/70" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-8 text-center">
                <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No conversations yet</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Connect a WhatsApp account and send a message to get started
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <Link
                    key={s.id}
                    href={`/whatsapp/conversations/${s.id}`}
                    className="block rounded-lg border border-white/[0.06] p-3 hover:border-white/[0.14] hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {s.customer_name || s.customer_phone}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.inbound_count + s.outbound_count} messages ·{" "}
                          {s.ai_response_count} AI · {s.human_response_count} human
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.is_escalated && (
                          <Badge variant="outline" className="text-xs text-destructive">
                            Escalated
                          </Badge>
                        )}
                        <Badge className={sessionStatusColors[s.status] || "bg-white/[0.06]"}>
                          {s.status}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Accounts */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Accounts
              </span>
              <Link href="/whatsapp/accounts" className="text-xs text-cyan hover:underline">
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/70" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="py-8 text-center">
                <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No accounts connected</p>
                <Link href="/whatsapp/accounts">
                  <Button className="mt-3" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Connect Account
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.slice(0, 5).map((a) => (
                  <div key={a.id} className="rounded-lg border border-white/[0.06] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{a.name}</p>
                      {a.is_verified ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-warning" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {a.is_verified ? "Verified" : "Pending verification"} · {a.timezone}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">
                        {a.enable_rag ? "RAG" : "No RAG"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {a.enable_human_handoff ? "Handoff" : "No Handoff"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {a.auto_reply_enabled ? "Auto-reply" : "Manual"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Link href="/whatsapp/conversations">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <Inbox className="mx-auto h-6 w-6 text-success" />
              <p className="mt-2 text-xs font-medium">Conversations</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/whatsapp/accounts">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <MessageCircle className="mx-auto h-6 w-6 text-cyan" />
              <p className="mt-2 text-xs font-medium">Accounts</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/whatsapp/templates">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <MessageSquare className="mx-auto h-6 w-6 text-indigo" />
              <p className="mt-2 text-xs font-medium">Templates</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/whatsapp/handoffs">
          <Card className="cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]">
            <CardContent className="pt-6 text-center">
              <Users className="mx-auto h-6 w-6 text-warning" />
              <p className="mt-2 text-xs font-medium">Handoffs</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/whatsapp/settings">
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
