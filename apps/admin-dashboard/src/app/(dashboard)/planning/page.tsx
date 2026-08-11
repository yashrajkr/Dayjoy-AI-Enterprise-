"use client";

import { useState, useEffect } from "react";
import {
  Loader2, Target, CheckCircle2, XCircle, Clock, RefreshCw,
  TrendingUp, ListChecks, GitBranch,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface PlanningSession {
  id: string; name: string; goal: string; goal_type: string;
  target_metric: string | null; target_value: number | null;
  current_value: number | null; time_horizon_days: number;
  status: string; progress_percent: number; selected_scenario_id: string | null;
  steps: any[]; scenarios: any[];
  started_at: string | null; completed_at: string | null;
  created_at: string;
}

interface Decision {
  id: string; title: string; decision_type: string; category: string | null;
  status: string; selected_option: string | null;
  approved_at: string | null; implemented_at: string | null;
  review_outcome: string | null; created_at: string;
}

interface Paginated<T> { data: T[]; meta: { pagination: { total: number } } }

export default function PlanningPage() {
  const [activeTab, setActiveTab] = useState<"sessions" | "decisions">("sessions");
  const [sessions, setSessions] = useState<PlanningSession[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSessions() {
    try {
      const resp = await api.get<Paginated<PlanningSession>>("/enterprise-os/planning/sessions?limit=50");
      setSessions(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed."); }
  }
  async function loadDecisions() {
    try {
      const resp = await api.get<Paginated<Decision>>("/enterprise-os/decisions?limit=50");
      setDecisions(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed."); }
  }

  useEffect(() => {
    setIsLoading(true);
    if (activeTab === "sessions") loadSessions();
    else loadDecisions();
    setIsLoading(false);
  }, [activeTab]);

  async function generatePlan(sessionId: string) {
    try {
      await api.post(`/enterprise-os/planning/sessions/${sessionId}/generate`);
      loadSessions();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed."); }
  }

  async function approveDecision(decisionId: string) {
    try {
      await api.post(`/enterprise-os/decisions/${decisionId}/approve`, {});
      loadDecisions();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed."); }
  }

  const stats = {
    sessions: sessions.length,
    activeSessions: sessions.filter((s) => s.status === "active").length,
    completedSessions: sessions.filter((s) => s.status === "completed").length,
    pendingDecisions: decisions.filter((d) => d.status === "proposed").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planning & Decisions</h1>
          <p className="text-sm text-muted-foreground">AI planner with multi-step planning, scenario comparison, and decision workflow</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => activeTab === "sessions" ? loadSessions() : loadDecisions()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Planning Sessions", value: stats.sessions, icon: Target, color: "text-indigo" },
          { label: "Active", value: stats.activeSessions, icon: TrendingUp, color: "text-warning" },
          { label: "Completed", value: stats.completedSessions, icon: CheckCircle2, color: "text-success" },
          { label: "Pending Decisions", value: stats.pendingDecisions, icon: Clock, color: "text-warning" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <div className="flex items-center gap-2">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex gap-1 border-b">
        <button onClick={() => setActiveTab("sessions")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${activeTab === "sessions" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Target className="h-4 w-4" /> Planning Sessions
        </button>
        <button onClick={() => setActiveTab("decisions")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${activeTab === "decisions" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <ListChecks className="h-4 w-4" /> Decisions
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : activeTab === "sessions" ? (
        sessions.length === 0 ? (
          <Card><CardContent className="p-12 text-center">
            <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No planning sessions yet.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.goal}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{s.status}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">Goal Type</p>
                      <p className="font-medium capitalize">{s.goal_type.replace("_", " ")}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Target</p>
                      <p className="font-medium">{s.target_metric ? `${s.target_value} ${s.target_metric}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Horizon</p>
                      <p className="font-medium">{s.time_horizon_days} days</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Progress</p>
                      <p className="font-medium">{s.progress_percent.toFixed(0)}%</p>
                    </div>
                  </div>
                  {s.steps && s.steps.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs font-semibold text-foreground/80 mb-2 flex items-center gap-1">
                        <ListChecks className="h-3 w-3" /> Steps ({s.steps.length})
                      </p>
                      <div className="space-y-1">
                        {s.steps.slice(0, 3).map((step: any, i: number) => (
                          <div key={i} className="text-xs flex items-start gap-2">
                            <span className="font-mono text-muted-foreground">{step.step_index}</span>
                            <span className="text-foreground/80 flex-1">{step.action}</span>
                            <Badge variant="outline" className="text-[10px] capitalize">{step.status}</Badge>
                          </div>
                        ))}
                        {s.steps.length > 3 && <p className="text-xs text-muted-foreground">+ {s.steps.length - 3} more steps</p>}
                      </div>
                    </div>
                  )}
                  {s.scenarios && s.scenarios.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs font-semibold text-foreground/80 mb-1 flex items-center gap-1">
                        <GitBranch className="h-3 w-3" /> Scenarios
                      </p>
                      <div className="flex gap-1 flex-wrap">
                        {s.scenarios.map((sc: any) => (
                          <Badge key={sc.id} variant={s.selected_scenario_id === sc.id ? "default" : "outline"}
                                 className="text-[10px]">
                            {sc.name} ({(sc.success_probability * 100).toFixed(0)}%)
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.status === "draft" && s.steps && s.steps.length === 0 && (
                    <Button size="sm" className="mt-3 w-full" onClick={() => generatePlan(s.id)}>
                      Generate Plan
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        decisions.length === 0 ? (
          <Card><CardContent className="p-12 text-center">
            <ListChecks className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No decisions yet.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {decisions.map((d) => {
              const statusColor = d.status === "approved" || d.status === "implemented" ? "bg-success/15 text-success" :
                                  d.status === "rejected" ? "bg-destructive/15 text-destructive" :
                                  d.status === "proposed" ? "bg-warning/15 text-warning" :
                                  "bg-white/[0.04] text-foreground/80";
              return (
                <Card key={d.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{d.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {d.decision_type} · {d.category || "uncategorized"} · Selected: {d.selected_option || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.review_outcome && (
                          <Badge variant="outline" className={
                            d.review_outcome === "success" ? "text-success border-success/40" :
                            d.review_outcome === "failed" ? "text-destructive border-destructive/40" : ""
                          }>{d.review_outcome}</Badge>
                        )}
                        <Badge className={statusColor}>{d.status}</Badge>
                        {d.status === "proposed" && (
                          <Button size="sm" variant="outline" onClick={() => approveDecision(d.id)}>Approve</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
