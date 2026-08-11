"use client";

import { useState, useEffect } from "react";
import { Activity, Bot, AlertCircle, CheckCircle, Clock, DollarSign, Zap, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface DashboardData {
  executions: { running: number; completed: number; failed: number; total: number };
  task_queue: { queued: number; running: number; completed: number; failed: number; total: number };
  agent_health: { healthy: number; degraded: number; unhealthy: number };
  cost_24h: { total_cents: number; total_tokens: number; avg_latency_ms: number; avg_confidence: number };
  agents: Array<{
    id: string; name: string; agent_type: string; model: string; is_active: boolean;
    health_status: string; consecutive_failures: number; circuit_breaker_state: string;
    avg_latency_ms: number | null; avg_cost_cents: number | null;
    total_executions: number; total_failures: number;
  }>;
}

export default function AgentMonitorPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setIsLoading(true);
    try {
      const resp = await api.get<{ data: DashboardData }>("/orchestration/monitor/dashboard");
      setData(resp.data);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Could not load dashboard.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000); // auto-refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !data) {
    return <div className="flex items-center justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (error) return <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>;
  if (!data) return null;

  const healthColors: Record<string, string> = {
    healthy: "bg-success/15 text-success",
    degraded: "bg-warning/15 text-warning",
    unhealthy: "bg-destructive/15 text-destructive",
    unknown: "bg-white/[0.04] text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Monitoring</h1>
          <p className="text-sm text-muted-foreground">Real-time health, performance, and cost tracking</p>
        </div>
        <Button variant="outline" onClick={loadDashboard} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo" />
              <div>
                <p className="text-2xl font-bold">{data.executions.total}</p>
                <p className="text-xs text-muted-foreground">Total Executions</p>
              </div>
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              <span className="text-success">✓ {data.executions.completed}</span>
              <span className="text-indigo">⟳ {data.executions.running}</span>
              <span className="text-destructive">✗ {data.executions.failed}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo" />
              <div>
                <p className="text-2xl font-bold">{data.cost_24h.avg_latency_ms}ms</p>
                <p className="text-xs text-muted-foreground">Avg Latency (24h)</p>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Confidence: {(data.cost_24h.avg_confidence * 100).toFixed(0)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-success" />
              <div>
                <p className="text-2xl font-bold">${(data.cost_24h.total_cents / 100).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Cost (24h)</p>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {data.cost_24h.total_tokens.toLocaleString()} tokens used
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" />
              <div>
                <p className="text-2xl font-bold">{data.task_queue.queued + data.task_queue.running}</p>
                <p className="text-xs text-muted-foreground">Active Tasks</p>
              </div>
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              <span className="text-warning">⏳ {data.task_queue.queued} queued</span>
              <span className="text-indigo">⟳ {data.task_queue.running} running</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Health Summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Agent Health Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              <span className="font-medium">{data.agent_health.healthy}</span>
              <span className="text-sm text-muted-foreground">Healthy</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              <span className="font-medium">{data.agent_health.degraded}</span>
              <span className="text-sm text-muted-foreground">Degraded</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="font-medium">{data.agent_health.unhealthy}</span>
              <span className="text-sm text-muted-foreground">Unhealthy</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent List */}
      <Card>
        <CardHeader><CardTitle className="text-base">Agent Status</CardTitle></CardHeader>
        <CardContent>
          {data.agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents found. Create agents in the Agents page.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Agent</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Model</th>
                    <th className="pb-2 pr-4">Health</th>
                    <th className="pb-2 pr-4">Circuit Breaker</th>
                    <th className="pb-2 pr-4">Executions</th>
                    <th className="pb-2 pr-4">Failures</th>
                    <th className="pb-2 pr-4">Avg Latency</th>
                    <th className="pb-2 pr-4">Avg Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((agent) => (
                    <tr key={agent.id} className="border-b">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{agent.name}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{agent.agent_type}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{agent.model}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded px-2 py-0.5 text-xs ${healthColors[agent.health_status] || healthColors.unknown}`}>
                          {agent.health_status}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs ${agent.circuit_breaker_state === "closed" ? "text-success" : agent.circuit_breaker_state === "open" ? "text-destructive" : "text-warning"}`}>
                          {agent.circuit_breaker_state}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{agent.total_executions}</td>
                      <td className="py-2 pr-4">
                        {agent.total_failures > 0 ? (
                          <span className="text-destructive">{agent.total_failures}</span>
                        ) : "0"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {agent.avg_latency_ms ? `${Math.round(agent.avg_latency_ms)}ms` : "—"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {agent.avg_cost_cents ? `$${(agent.avg_cost_cents / 100).toFixed(4)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
