"use client";

import { useState, useEffect } from "react";
import {
  Activity, Beaker, CheckCircle2, XCircle, Loader2, TrendingUp,
  BarChart3, Play, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface Simulation {
  id: string; name: string; simulation_type: string; description: string | null;
  status: string; progress_percent: number; time_horizon_days: number;
  time_step_days: number; monte_carlo_runs: number;
  started_at: string | null; completed_at: string | null;
  error: string | null; created_at: string;
}

interface Paginated<T> { data: T[]; meta: { pagination: { total: number } } }

export default function SimulationsPage() {
  const [sims, setSims] = useState<Simulation[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSim, setSelectedSim] = useState<Simulation | null>(null);
  const [results, setResults] = useState<any[]>([]);

  async function loadSims() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, unknown> = { limit: 50 };
      if (filterStatus !== "all") params.status = filterStatus;
      const resp = await api.get<Paginated<Simulation>>("/enterprise-os/simulations", params);
      setSims(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load."); }
    setIsLoading(false);
  }

  async function loadResults(simId: string) {
    try {
      const resp = await api.get<Paginated<any>>(`/enterprise-os/simulations/${simId}/results?limit=100`);
      setResults(resp.data || []);
    } catch (err: unknown) { /* ignore */ }
  }

  useEffect(() => { loadSims(); /* eslint-disable-next-line */ }, [filterStatus]);

  const stats = {
    total: sims.length,
    running: sims.filter((s) => s.status === "running").length,
    completed: sims.filter((s) => s.status === "completed").length,
    failed: sims.filter((s) => s.status === "failed").length,
  };

  async function runSimulation(simId: string) {
    try {
      await api.post(`/enterprise-os/simulations/${simId}/run`);
      loadSims();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Run failed."); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Simulations</h1>
          <p className="text-sm text-muted-foreground">What-if analysis, business simulations, financial forecasts, demand/churn/risk modeling</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSims}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Simulations", value: stats.total, icon: Beaker, color: "text-indigo" },
          { label: "Running", value: stats.running, icon: Activity, color: "text-warning" },
          { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-success" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "text-destructive" },
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
        {["all", "pending", "running", "completed", "failed"].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`border-b-2 px-3 py-2 text-xs font-medium capitalize ${filterStatus === s ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : sims.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Beaker className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No simulations yet. Create one via the API.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sims.map((s) => {
            const statusColor = s.status === "completed" ? "bg-success/15 text-success" :
                                s.status === "running" ? "bg-warning/15 text-warning" :
                                s.status === "failed" ? "bg-destructive/15 text-destructive" :
                                "bg-white/[0.04] text-foreground/80";
            return (
              <Card key={s.id} className={selectedSim?.id === s.id ? "border-primary" : ""}
                    onClick={() => { setSelectedSim(s); loadResults(s.id); }}>
                <CardContent className="p-4 cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{s.simulation_type.replace("_", "-")}</p>
                    </div>
                    <Badge className={statusColor}>{s.status}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{s.description || "No description"}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground border-t pt-3">
                    <span>Horizon: {s.time_horizon_days}d</span>
                    <span>Step: {s.time_step_days}d</span>
                    <span>MC runs: {s.monte_carlo_runs}</span>
                    <span>Progress: {s.progress_percent.toFixed(0)}%</span>
                  </div>
                  {s.status === "pending" && (
                    <Button size="sm" className="mt-2 w-full"
                            onClick={(e) => { e.stopPropagation(); runSimulation(s.id); }}>
                      <Play className="h-3 w-3 mr-1" /> Run Simulation
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedSim && results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Results: {selectedSim.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3">Step</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Branch</th>
                  <th className="pb-2 pr-3">Key Metrics</th>
                  <th className="pb-2 pr-3">Events</th>
                </tr></thead>
                <tbody>
                  {results.slice(0, 30).map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-1 pr-3">{r.step_index}</td>
                      <td className="py-1 pr-3">{r.step_date ? new Date(r.step_date).toLocaleDateString() : "—"}</td>
                      <td className="py-1 pr-3"><Badge variant="outline" className="text-[10px]">{r.scenario_branch}</Badge></td>
                      <td className="py-1 pr-3">
                        {Object.entries(r.metrics || {}).slice(0, 3).map(([k, v]: [string, any]) => (
                          <span key={k} className="text-muted-foreground mr-2">{k}: {typeof v === "number" ? v.toFixed(2) : v}</span>
                        ))}
                      </td>
                      <td className="py-1 pr-3">{(r.events || []).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length > 30 && <p className="text-xs text-muted-foreground mt-2">Showing 30 of {results.length} results.</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
