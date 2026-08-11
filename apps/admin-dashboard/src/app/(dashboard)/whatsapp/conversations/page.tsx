"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  MessageCircle,
  RefreshCw,
  AlertCircle,
  Loader2,
  Clock,
  User,
  Bot,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { whatsappApi, type WhatsAppSession } from "@/lib/api";

const statusColors: Record<string, string> = {
  active: "border border-success/25 bg-success/10 text-success",
  waiting_ai: "border border-cyan/25 bg-cyan/10 text-cyan",
  waiting_human: "border border-warning/25 bg-warning/10 text-warning",
  completed: "border border-white/10 bg-white/[0.06] text-muted-foreground",
  escalated: "border border-destructive/25 bg-destructive/10 text-destructive",
};

export default function ConversationsPage() {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: { status?: string; limit?: number; offset?: number } = { limit, offset };
      if (statusFilter) params.status = statusFilter;
      const res = await whatsappApi.listSessions(params);
      setSessions(res.sessions);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [limit, offset, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Conversations</h1>
          <p className="text-sm text-muted-foreground">{total} total conversations</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
            className="flex h-10 w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="waiting_ai">Waiting AI</option>
            <option value="waiting_human">Waiting Human</option>
            <option value="completed">Completed</option>
            <option value="escalated">Escalated</option>
          </select>
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
              <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No conversations found</p>
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
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                        <User className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {s.customer_name || s.customer_phone}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.customer_phone} · {s.language.toUpperCase()} ·{" "}
                          {s.inbound_count + s.outbound_count} messages
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.ai_response_count > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Bot className="mr-1 h-3 w-3" />
                          {s.ai_response_count} AI
                        </Badge>
                      )}
                      {s.human_response_count > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <User className="mr-1 h-3 w-3" />
                          {s.human_response_count} Human
                        </Badge>
                      )}
                      {s.is_escalated && (
                        <Badge variant="outline" className="text-xs text-destructive">
                          Escalated
                        </Badge>
                      )}
                      {s.rag_used && (
                        <Badge variant="outline" className="text-xs text-indigo">
                          RAG
                        </Badge>
                      )}
                      <Badge className={statusColors[s.status] || "bg-white/[0.06]"}>
                        {s.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {s.last_message_at ? new Date(s.last_message_at).toLocaleString() : "—"}
                    </span>
                    {s.outcome && (
                      <Badge variant="secondary" className="text-xs capitalize">
                        {s.outcome}
                      </Badge>
                    )}
                    {s.ai_confidence_avg !== null && (
                      <span>
                        AI confidence: {(s.ai_confidence_avg * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {total > limit && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            Previous
          </Button>
          <span className="self-center text-sm text-muted-foreground">
            {offset + 1} - {Math.min(offset + limit, total)} of {total}
          </span>
          <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
