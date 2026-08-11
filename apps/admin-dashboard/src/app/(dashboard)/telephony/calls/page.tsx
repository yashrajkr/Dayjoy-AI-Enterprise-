"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  RefreshCw,
  AlertCircle,
  Loader2,
  Clock,
  Download,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { telephonyApi, type TelephonyCallLog } from "@/lib/api";

const statusColors: Record<string, string> = {
  completed: "border border-white/10 bg-white/[0.06] text-muted-foreground",
  failed: "border border-destructive/25 bg-destructive/10 text-destructive",
  busy: "border border-warning/25 bg-warning/10 text-warning",
  no_answer: "bg-warning/15 text-warning",
};

const directionIcons: Record<string, React.ElementType> = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  transfer: PhoneOutgoing,
};

export default function CallHistoryPage() {
  const [calls, setCalls] = useState<TelephonyCallLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: { outcome?: string; direction?: string; limit?: number; offset?: number } = { limit, offset };
      if (outcomeFilter) params.outcome = outcomeFilter;
      if (directionFilter) params.direction = directionFilter;
      const res = await telephonyApi.listCallHistory(params);
      setCalls(res.calls);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load call history");
    } finally {
      setLoading(false);
    }
  }, [limit, offset, outcomeFilter, directionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Call History</h1>
          <p className="text-sm text-muted-foreground">{total} total calls</p>
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
              value={directionFilter}
              onChange={(e) => { setDirectionFilter(e.target.value); setOffset(0); }}
              className="flex h-10 w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="transfer">Transfer</option>
            </select>
            <select
              value={outcomeFilter}
              onChange={(e) => { setOutcomeFilter(e.target.value); setOffset(0); }}
              className="flex h-10 w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All outcomes</option>
              <option value="resolved">Resolved</option>
              <option value="unresolved">Unresolved</option>
              <option value="escalated">Escalated</option>
              <option value="missed">Missed</option>
              <option value="voicemail">Voicemail</option>
              <option value="failed">Failed</option>
              <option value="transferred">Transferred</option>
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
          ) : calls.length === 0 ? (
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
                    <th className="pb-2 pr-4 font-medium">AI</th>
                    <th className="pb-2 pr-4 font-medium">Outcome</th>
                    <th className="pb-2 pr-4 font-medium">Recording</th>
                    <th className="pb-2 pr-4 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => {
                    const DirIcon = directionIcons[c.direction] || PhoneCall;
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:border-white/[0.14] hover:bg-white/[0.04]">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <DirIcon className="h-4 w-4 text-muted-foreground/70" />
                            <div>
                              <p className="font-medium">{c.caller_name || c.from_number}</p>
                              {c.caller_name && <p className="text-xs text-muted-foreground">{c.from_number}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant="outline" className="capitalize">{c.direction}</Badge>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge className={statusColors[c.status] || "bg-white/[0.06]"}>
                            {c.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {Math.floor(c.duration_seconds / 60)}m {c.duration_seconds % 60}s
                        </td>
                        <td className="py-3 pr-4">
                          {c.ai_handled ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary">AI</Badge>
                              {c.ai_resolution && (
                                <Badge className="border border-success/25 bg-success/10 text-success text-xs">Resolved</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/70">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {c.outcome ? (
                            <Badge variant="secondary" className="capitalize">{c.outcome}</Badge>
                          ) : (
                            <span className="text-muted-foreground/70">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {c.has_recording ? (
                            <a href={`/api/v1/telephony/recordings/${c.recording_id}`} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm">
                                <Play className="h-4 w-4" />
                              </Button>
                            </a>
                          ) : (
                            <span className="text-muted-foreground/70">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {c.started_at ? new Date(c.started_at).toLocaleString() : "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
