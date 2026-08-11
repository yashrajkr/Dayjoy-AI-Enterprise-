"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { voiceApi, type VoiceSession } from "@/lib/api";

const statusColors: Record<string, string> = {
  ringing: "border border-cyan/25 bg-cyan/10 text-cyan",
  answered: "border border-success/25 bg-success/10 text-success",
  in_progress: "border border-success/25 bg-success/10 text-success",
  completed: "border border-white/10 bg-white/[0.06] text-muted-foreground",
  failed: "border border-destructive/25 bg-destructive/10 text-destructive",
  missed: "border border-warning/25 bg-warning/10 text-warning",
  escalated: "border border-indigo/25 bg-indigo/10 text-indigo",
};

const directionIcons: Record<string, React.ElementType> = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  web: PhoneCall,
};

export default function VoiceSessionsPage() {
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: { status?: string; direction?: string; limit?: number; offset?: number } = { limit, offset };
      if (statusFilter) params.status = statusFilter;
      if (directionFilter) params.direction = directionFilter;
      const res = await voiceApi.listSessions(params);
      setSessions(res.sessions);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [limit, offset, statusFilter, directionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Conversation History</h1>
          <p className="text-sm text-muted-foreground">All voice calls — {total} total</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setOffset(0);
              }}
              className="flex h-10 w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="ringing">Ringing</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="missed">Missed</option>
              <option value="escalated">Escalated</option>
            </select>
            <select
              value={directionFilter}
              onChange={(e) => {
                setDirectionFilter(e.target.value);
                setOffset(0);
              }}
              className="flex h-10 w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="web">Web (VoIP)</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center">
              <PhoneCall className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No calls found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Caller</th>
                    <th className="pb-2 pr-4 font-medium">Direction</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Duration</th>
                    <th className="pb-2 pr-4 font-medium">Turns</th>
                    <th className="pb-2 pr-4 font-medium">Outcome</th>
                    <th className="pb-2 pr-4 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const DirIcon = directionIcons[s.direction] || PhoneCall;
                    return (
                      <Link
                        key={s.id}
                        href={`/voice/sessions/${s.id}`}
                        className="block"
                      >
                        <tr className="cursor-pointer border-b last:border-0 hover:border-white/[0.14] hover:bg-white/[0.04]">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <DirIcon className="h-4 w-4 text-muted-foreground/70" />
                              <div>
                                <p className="font-medium">
                                  {s.caller_name || s.caller_phone || "Unknown"}
                                </p>
                                {s.caller_phone && s.caller_name && (
                                  <p className="text-xs text-muted-foreground">{s.caller_phone}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant="outline" className="capitalize">{s.direction}</Badge>
                          </td>
                          <td className="py-3 pr-4">
                            <Badge className={statusColors[s.status] || "bg-white/[0.06]"}>
                              {s.status}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {Math.floor(s.duration_seconds / 60)}m {s.duration_seconds % 60}s
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{s.turn_count}</td>
                          <td className="py-3 pr-4">
                            {s.outcome ? (
                              <Badge variant="secondary" className="capitalize">{s.outcome}</Badge>
                            ) : (
                              <span className="text-muted-foreground/70">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {s.started_at ? new Date(s.started_at).toLocaleString() : "—"}
                            </div>
                          </td>
                        </tr>
                      </Link>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > limit && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <span className="self-center text-sm text-muted-foreground">
            {offset + 1} - {Math.min(offset + limit, total)} of {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
