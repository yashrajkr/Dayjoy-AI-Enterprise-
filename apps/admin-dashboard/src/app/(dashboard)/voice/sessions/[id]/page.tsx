"use client";

import { useEffect, useState, use } from "react";
import {
  ArrowLeft,
  Phone,
  Clock,
  TrendingUp,
  Activity,
  AlertCircle,
  Loader2,
  User,
  Bot,
  CheckCircle,
  XCircle,
  Download,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { voiceApi, type VoiceSession, type VoiceMessage } from "@/lib/api";

const speakerIcons: Record<string, React.ElementType> = {
  caller: User,
  assistant: Bot,
  system: Activity,
  human: User,
};

const speakerColors: Record<string, string> = {
  caller: "bg-cyan/[0.06] border-cyan/20",
  assistant: "bg-success/[0.06] border-success/20",
  system: "bg-white/[0.03] border-white/[0.08]",
  human: "bg-indigo/[0.06] border-indigo/20",
};

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, msgs, evts, an] = await Promise.all([
          voiceApi.getSession(id),
          voiceApi.getSessionMessages(id),
          voiceApi.getSessionEvents(id).catch(() => []),
          voiceApi.getSessionAnalytics(id).catch(() => null),
        ]);
        setSession(s);
        setMessages(msgs);
        setEvents(evts);
        if (an) setAnalytics(an);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error || "Session not found"}
        </div>
        <Link href="/voice/sessions">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sessions
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/voice/sessions"
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Sessions
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Call: {session.caller_name || session.caller_phone || "Unknown"}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" className="capitalize">{session.direction}</Badge>
          <Badge variant="outline">{session.provider}</Badge>
          <Badge variant="outline" className="uppercase">{session.language}</Badge>
          <Badge>{session.status}</Badge>
          {session.outcome && (
            <Badge variant="secondary" className="capitalize">{session.outcome}</Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="mt-1 text-lg font-bold">
              {Math.floor(session.duration_seconds / 60)}m {session.duration_seconds % 60}s
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Turns</p>
            <p className="mt-1 text-lg font-bold">{session.turn_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Barge-ins</p>
            <p className="mt-1 text-lg font-bold">{session.barge_in_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Interruptions</p>
            <p className="mt-1 text-lg font-bold">{session.interruption_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Avg AI Latency</p>
            <p className="mt-1 text-lg font-bold">
              {analytics && analytics.avg_ai_latency_ms ? `${analytics.avg_ai_latency_ms}ms` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Avg Confidence</p>
            <p className="mt-1 text-lg font-bold">
              {analytics && analytics.avg_ai_confidence
                ? `${((analytics.avg_ai_confidence as number) * 100).toFixed(0)}%`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      {session.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{session.summary}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="transcript">
        <TabsList>
          <TabsTrigger value="transcript">Transcript ({messages.length})</TabsTrigger>
          <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="metadata">Details</TabsTrigger>
        </TabsList>

        {/* Transcript */}
        <TabsContent value="transcript">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conversation Transcript</CardTitle>
              <CardDescription>
                Real-time transcript with STT/AI confidence + latency
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No messages recorded</p>
              ) : (
                messages.map((m) => {
                  const Icon = speakerIcons[m.speaker] || Activity;
                  return (
                    <div
                      key={m.id}
                      className={`rounded-lg border border-white/[0.06] p-4 ${speakerColors[m.speaker] || "bg-white/[0.03]"}`}
                    >
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span className="font-medium capitalize">{m.speaker}</span>
                          <span className="text-muted-foreground">#{m.sequence}</span>
                          {m.start_time > 0 && (
                            <span className="text-muted-foreground">
                              · {Math.floor(m.start_time)}s
                            </span>
                          )}
                          {m.interrupted && (
                            <Badge variant="outline" className="text-xs text-warning">
                              interrupted by {m.interrupted_by}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          {m.stt_confidence !== null && (
                            <span>STT: {(m.stt_confidence * 100).toFixed(0)}%</span>
                          )}
                          {m.ai_confidence !== null && (
                            <span>AI: {(m.ai_confidence * 100).toFixed(0)}%</span>
                          )}
                          {m.latency_ms > 0 && <span>{m.latency_ms}ms</span>}
                          {m.model && <span className="text-muted-foreground/70">{m.model}</span>}
                        </div>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{m.text}</p>
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-2 border-t border-white/[0.08] pt-2">
                          <p className="text-xs text-muted-foreground mb-1">
                            Citations ({m.citations.length}):
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {m.citations.slice(0, 3).map((c, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {String(c.document_title || c.title || "Source")}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Events */}
        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Call Events</CardTitle>
              <CardDescription>Granular event log (status changes, STT/TTS, errors)</CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No events recorded</p>
              ) : (
                <div className="space-y-1">
                  {events.map((e, i) => (
                    <div
                      key={String(e.id || i)}
                      className="flex items-start gap-3 rounded-md border p-2 text-sm"
                    >
                      <div className="w-32 flex-shrink-0">
                        <p className="font-mono text-xs">{String(e.event_type || "")}</p>
                        <p className="text-xs text-muted-foreground">
                          +{Number(e.timestamp_offset || 0).toFixed(2)}s
                        </p>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs">
                          <span className="text-muted-foreground">source:</span> {String(e.source || "—")}{" "}
                          · <span className="text-muted-foreground">severity:</span> {String(e.severity || "info")}
                        </p>
                        {e.error_message && (
                          <p className="mt-1 text-xs text-destructive">{String(e.error_message)}</p>
                        )}
                        {Object.keys(e.payload as object || {}).length > 0 && (
                          <pre className="mt-1 overflow-auto rounded bg-white/[0.03] p-2 text-xs">
                            {JSON.stringify(e.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics */}
        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Per-Session Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(analytics).map(([key, value]) => {
                    if (key === "id" || key === "session_id" || key === "assistant_id") return null;
                    const formatted = typeof value === "number"
                      ? (key.includes("ms") ? `${value}ms` : key.includes("seconds") ? `${Math.floor(Number(value) / 60)}m ${Number(value) % 60}s` : value)
                      : value === null || value === undefined ? "—" : String(value);
                    return (
                      <div key={key}>
                        <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
                        <p className="text-sm font-medium">{formatted}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Analytics not yet computed
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metadata */}
        <TabsContent value="metadata">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Call Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Call SID</p>
                  <p className="text-sm font-mono">{session.call_sid}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Provider Assistant ID</p>
                  <p className="text-sm font-mono">{session.provider_assistant_id || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Started</p>
                  <p className="text-sm">{session.started_at ? new Date(session.started_at).toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ended</p>
                  <p className="text-sm">{session.ended_at ? new Date(session.ended_at).toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Caller Phone</p>
                  <p className="text-sm">{session.caller_phone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Callee Phone</p>
                  <p className="text-sm">{session.callee_phone || "—"}</p>
                </div>
                {session.transferred_to && (
                  <div>
                    <p className="text-xs text-muted-foreground">Transferred To</p>
                    <p className="text-sm">{session.transferred_to}</p>
                  </div>
                )}
                {session.hangup_cause && (
                  <div>
                    <p className="text-xs text-muted-foreground">Hangup Cause</p>
                    <p className="text-sm">{session.hangup_cause}</p>
                  </div>
                )}
                {session.error_message && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Error</p>
                    <p className="text-sm text-destructive">{session.error_message}</p>
                  </div>
                )}
              </div>
              {session.recording_url && (
                <div className="mt-4">
                  <a href={session.recording_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Download className="mr-2 h-4 w-4" />
                      Download Recording
                    </Button>
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
