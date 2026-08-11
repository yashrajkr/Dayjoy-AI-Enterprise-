"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  RefreshCw,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { whatsappApi, type WhatsAppHandoff } from "@/lib/api";

const statusColors: Record<string, string> = {
  pending: "border border-warning/25 bg-warning/10 text-warning",
  assigned: "border border-cyan/25 bg-cyan/10 text-cyan",
  in_progress: "border border-success/25 bg-success/10 text-success",
  resolved: "border border-white/10 bg-white/[0.06] text-muted-foreground",
  cancelled: "border border-destructive/25 bg-destructive/10 text-destructive",
};

const priorityColors: Record<string, string> = {
  low: "bg-white/[0.06] text-muted-foreground",
  medium: "bg-cyan/15 text-cyan",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

export default function HandoffsPage() {
  const [handoffs, setHandoffs] = useState<WhatsAppHandoff[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: { status?: string } = {};
      if (statusFilter) params.status = statusFilter;
      const res = await whatsappApi.listHandoffs(params);
      setHandoffs(res.handoffs);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load handoffs");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Human Handoffs</h1>
          <p className="text-sm text-muted-foreground">{total} total handoff requests</p>
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
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-10 w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
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
          ) : handoffs.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No handoff requests</p>
            </div>
          ) : (
            <div className="space-y-2">
              {handoffs.map((h) => (
                <div key={h.id} className="rounded-lg border border-white/[0.06] p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                        <Users className="h-5 w-5 text-warning" />
                      </div>
                      <div>
                        <p className="font-medium capitalize">{h.reason.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">
                          Session: {h.session_id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={priorityColors[h.priority] || "bg-white/[0.06]"}>{h.priority}</Badge>
                      <Badge className={statusColors[h.status] || "bg-white/[0.06]"}>{h.status}</Badge>
                    </div>
                  </div>
                  {h.reason_details && <p className="mt-2 text-sm text-muted-foreground">{h.reason_details}</p>}
                  {h.ai_summary && <p className="mt-1 text-xs text-muted-foreground italic">{h.ai_summary}</p>}
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                    {h.response_time_ms !== null && (
                      <span>Response: {(h.response_time_ms / 1000).toFixed(1)}s</span>
                    )}
                    {h.ai_confidence !== null && (
                      <span>AI Conf: {(h.ai_confidence * 100).toFixed(0)}%</span>
                    )}
                    {h.satisfaction_score !== null && (
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-success" />
                        CSAT: {h.satisfaction_score}/5
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
