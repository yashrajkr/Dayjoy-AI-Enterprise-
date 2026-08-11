"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Workflow, Plus, Play, Pause, StopCircle, RefreshCw, Clock, CheckCircle, XCircle, Activity, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface WorkflowDef {
  id: string; name: string; description: string | null; trigger_type: string;
  status: string; is_active: boolean; version: number; category: string | null;
  tags: string[]; icon: string | null; created_at: string; updated_at: string;
}

interface Execution {
  id: string; workflow_id: string; status: string;
  started_at: string | null; completed_at: string | null; created_at: string;
}

interface Dashboard {
  executions: { running: number; paused: number; completed: number; failed: number; cancelled: number; total: number };
  queue: Record<string, number>;
  performance_24h: { avg_latency_ms: number; completed_count: number };
  timeline: Execution[];
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTrigger, setNewTrigger] = useState("manual");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"workflows" | "monitor" | "history">("workflows");

  async function loadData() {
    setIsLoading(true);
    try {
      const [wfResp, dashResp] = await Promise.all([
        api.get<{ data: WorkflowDef[] }>("/workflow-automation/workflows"),
        api.get<{ data: Dashboard }>("/workflow-automation/monitor/dashboard"),
      ]);
      setWorkflows(wfResp.data);
      setDashboard(dashResp.data);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Could not load data.");
    } finally { setIsLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await api.post("/workflow-automation/workflows", {
        name: newName, description: newDesc || undefined, trigger_type: newTrigger,
        definition: { nodes: [{ id: "start", type: "trigger" }, { id: "end", type: "end" }],
                      edges: [{ from: "start", to: "end" }] },
      });
      setNewName(""); setNewDesc(""); setShowCreate(false); await loadData();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Create failed."); }
  }

  async function handleExecute(id: string) {
    try { await api.post(`/workflow-automation/workflows/${id}/execute`, { input_data: {} }); await loadData(); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Execute failed."); }
  }

  const statusColors: Record<string, string> = {
    completed: "bg-success/15 text-success", running: "bg-indigo/15 text-indigo",
    failed: "bg-destructive/15 text-destructive", paused: "bg-warning/15 text-warning",
    cancelled: "bg-white/[0.04] text-muted-foreground", queued: "bg-indigo/15 text-indigo",
  };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflow Automation</h1>
          <p className="text-sm text-muted-foreground">Create, execute, and monitor automated business processes</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}><Plus className="mr-2 h-4 w-4" /> New Workflow</Button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Stats */}
      {dashboard && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[
            { label: "Running", value: dashboard.executions.running, icon: Activity, color: "text-indigo" },
            { label: "Completed", value: dashboard.executions.completed, icon: CheckCircle, color: "text-success" },
            { label: "Failed", value: dashboard.executions.failed, icon: XCircle, color: "text-destructive" },
            { label: "Avg Latency", value: `${dashboard.performance_24h.avg_latency_ms}ms`, icon: Clock, color: "text-indigo" },
            { label: "Total", value: dashboard.executions.total, icon: Workflow, color: "text-warning" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  <div><p className="text-2xl font-bold">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.label}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["workflows", "monitor", "history"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {tab}
          </button>
        ))}
      </div>

      {showCreate && activeTab === "workflows" && (
        <Card><CardHeader><CardTitle>Create workflow</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus /></div>
              <div className="space-y-2"><Label htmlFor="desc">Description</Label><Input id="desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="trigger">Trigger</Label>
                <select id="trigger" value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)} className="w-full rounded-md border border-border p-2">
                  <option value="manual">Manual</option><option value="api">API</option><option value="webhook">Webhook</option>
                  <option value="schedule">Schedule</option><option value="event">Event</option>
                </select>
              </div>
              <Button type="submit">Create</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === "workflows" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.length === 0 ? (
            <Card><CardContent className="py-12 text-center"><Workflow className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">No workflows yet.</p></CardContent></Card>
          ) : workflows.map((wf) => (
            <Card key={wf.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Workflow className="h-5 w-5 text-primary" /></div>
                    <div><p className="font-medium">{wf.name}</p><span className="text-xs text-muted-foreground">{wf.trigger_type} · v{wf.version}</span></div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${wf.is_active ? "bg-success/15 text-success" : "bg-white/[0.04] text-muted-foreground"}`}>{wf.is_active ? "Active" : "Inactive"}</span>
                </div>
                {wf.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{wf.description}</p>}
                <div className="mt-3 flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => handleExecute(wf.id)} className="h-7 px-2 text-xs"><Play className="mr-1 h-3 w-3" /> Run</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "monitor" && dashboard && (
        <Card><CardHeader><CardTitle className="text-base">Execution Timeline (Last 20)</CardTitle></CardHeader>
          <CardContent>
            {dashboard.timeline.length === 0 ? <p className="text-sm text-muted-foreground">No executions yet.</p> : (
              <div className="space-y-2">
                {dashboard.timeline.map((exec) => (
                  <div key={exec.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${statusColors[exec.status] || "bg-white/[0.04]"}`}>{exec.status}</span>
                      <span className="text-muted-foreground font-mono text-xs">{exec.id.substring(0, 8)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(exec.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "history" && (
        <ExecutionHistory />
      )}
    </div>
  );
}

function ExecutionHistory() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const resp = await api.get<{ data: Execution[] }>("/workflow-automation/executions?limit=50");
        setExecutions(resp.data);
      } catch { /* best-effort */ } finally { setIsLoading(false); }
    }
    load();
  }, []);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const statusIcons: Record<string, typeof CheckCircle> = {
    completed: CheckCircle, running: Activity, failed: XCircle, paused: Pause, cancelled: StopCircle,
  };

  return (
    <Card><CardHeader><CardTitle className="text-base">Execution History</CardTitle></CardHeader>
      <CardContent>
        {executions.length === 0 ? <p className="text-sm text-muted-foreground">No executions recorded.</p> : (
          <div className="space-y-2">
            {executions.map((exec) => {
              const Icon = statusIcons[exec.status] || Activity;
              return (
                <div key={exec.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${exec.status === "completed" ? "text-success" : exec.status === "failed" ? "text-destructive" : "text-indigo"}`} />
                    <span className="font-mono text-xs">{exec.id.substring(0, 8)}</span>
                    <span className="text-muted-foreground">{exec.workflow_id.substring(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className={`rounded px-1.5 py-0.5 ${exec.status === "completed" ? "bg-success/15 text-success" : exec.status === "failed" ? "bg-destructive/15 text-destructive" : "bg-indigo/15 text-indigo"}`}>{exec.status}</span>
                    <span>{new Date(exec.created_at).toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
