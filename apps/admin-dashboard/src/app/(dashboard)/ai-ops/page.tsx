"use client";

import { useState, useEffect } from "react";
import { Activity, Shield, DollarSign, Gauge, Bot, FileText, Loader2, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Dashboard {
  period_days: number; total_requests: number; total_cost_cents: number;
  total_tokens: number; avg_latency_ms: number; error_count: number;
  error_rate: number; by_model: Array<{ model: string; requests: number; cost_cents: number }>;
}

interface CostReport {
  period_days: number; total_cost_cents: number; total_tokens: number; total_requests: number;
  cost_by_model: Record<string, { cost_cents: number; tokens: number; requests: number }>;
  forecast_next_month_cents: number;
}

export default function AIOpsPage() {
  const [activeTab, setActiveTab] = useState<"observatory" | "guardrails" | "cost" | "models">("observatory");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [costReport, setCostReport] = useState<CostReport | null>(null);
  const [models, setModels] = useState<any[]>([]);
  const [guardrailEvents, setGuardrailEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadObservatory() {
    try { const resp = await api.get<{ data: Dashboard }>("/ai-ops/observatory/dashboard?days=7"); setDashboard(resp.data); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }
  async function loadCost() {
    try { const resp = await api.get<{ data: CostReport }>("/ai-ops/cost/report?days=30"); setCostReport(resp.data); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }
  async function loadModels() {
    try { const resp = await api.get<{ data: any[] }>("/ai-ops/model-router/models"); setModels(resp.data); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }
  async function loadGuardrails() {
    try { const resp = await api.get<{ data: any[] }>("/ai-ops/guardrails/events?limit=20"); setGuardrailEvents(resp.data); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }

  useEffect(() => {
    setIsLoading(true); setError(null);
    if (activeTab === "observatory") loadObservatory();
    if (activeTab === "cost") loadCost();
    if (activeTab === "models") loadModels();
    if (activeTab === "guardrails") loadGuardrails();
    setIsLoading(false);
  }, [activeTab]);

  const tabs = [
    { id: "observatory" as const, label: "Observatory", icon: Activity },
    { id: "guardrails" as const, label: "Guardrails", icon: Shield },
    { id: "cost" as const, label: "Cost", icon: DollarSign },
    { id: "models" as const, label: "Models", icon: Bot },
  ];

  if (isLoading && !dashboard) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">AI Operations</h1><p className="text-sm text-muted-foreground">Reliability, observability, and cost management</p></div>
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "observatory" && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: "Total Requests", value: dashboard.total_requests.toLocaleString(), icon: Activity, color: "text-indigo" },
              { label: "Total Cost", value: `$${(dashboard.total_cost_cents / 100).toFixed(2)}`, icon: DollarSign, color: "text-success" },
              { label: "Total Tokens", value: dashboard.total_tokens.toLocaleString(), icon: Gauge, color: "text-indigo" },
              { label: "Avg Latency", value: `${dashboard.avg_latency_ms}ms`, icon: Clock, color: "text-warning" },
              { label: "Error Rate", value: `${(dashboard.error_rate * 100).toFixed(1)}%`, icon: AlertTriangle, color: dashboard.error_rate > 0.1 ? "text-destructive" : "text-success" },
            ].map((s) => (
              <Card key={s.label}><CardContent className="p-4">
                <div className="flex items-center gap-2"><s.icon className={`h-5 w-5 ${s.color}`} />
                  <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
                </div>
              </CardContent></Card>
            ))}
          </div>
          <Card><CardHeader><CardTitle className="text-base">By Model</CardTitle></CardHeader>
            <CardContent>
              {dashboard.by_model.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> : (
                <div className="space-y-2">{dashboard.by_model.map((m) => (
                  <div key={m.model} className="flex items-center justify-between rounded border p-2 text-sm">
                    <span className="font-medium">{m.model}</span>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{m.requests} requests</span>
                      <span>${(m.cost_cents / 100).toFixed(4)}</span>
                    </div>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "guardrails" && (
        <Card><CardHeader><CardTitle className="text-base">Guardrail Events (Last 20)</CardTitle></CardHeader>
          <CardContent>
            {guardrailEvents.length === 0 ? <p className="text-sm text-muted-foreground">No guardrail events.</p> : (
              <div className="space-y-2">{guardrailEvents.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${e.severity === "critical" ? "bg-destructive/15 text-destructive" : e.severity === "warning" ? "bg-warning/15 text-warning" : "bg-white/[0.04] text-muted-foreground"}`}>{e.severity}</span>
                    <span className="font-medium">{e.guardrail_type}</span>
                    <span className="text-xs text-muted-foreground">{e.direction}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className={`rounded px-1.5 py-0.5 ${e.action === "block" ? "bg-destructive/15 text-destructive" : e.action === "flag" ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>{e.action}</span>
                    <span>{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}</div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "cost" && costReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Total Cost (30d)", value: `$${(costReport.total_cost_cents / 100).toFixed(2)}`, icon: DollarSign },
              { label: "Total Tokens", value: costReport.total_tokens.toLocaleString(), icon: Gauge },
              { label: "Total Requests", value: costReport.total_requests.toLocaleString(), icon: Activity },
              { label: "Forecast (next month)", value: `$${(costReport.forecast_next_month_cents / 100).toFixed(2)}`, icon: FileText },
            ].map((s) => (
              <Card key={s.label}><CardContent className="p-4">
                <div className="flex items-center gap-2"><s.icon className="h-5 w-5 text-primary" />
                  <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
                </div>
              </CardContent></Card>
            ))}
          </div>
          <Card><CardHeader><CardTitle className="text-base">Cost by Model</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(costReport.cost_by_model).length === 0 ? <p className="text-sm text-muted-foreground">No cost data.</p> : (
                <div className="space-y-2">{Object.entries(costReport.cost_by_model).map(([model, data]: [string, any]) => (
                  <div key={model} className="flex items-center justify-between rounded border p-2 text-sm">
                    <span className="font-medium">{model}</span>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{data.requests} requests</span>
                      <span>{data.tokens.toLocaleString()} tokens</span>
                      <span>${(data.cost_cents / 100).toFixed(4)}</span>
                    </div>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "models" && (
        <Card><CardHeader><CardTitle className="text-base">Registered Models</CardTitle></CardHeader>
          <CardContent>
            {models.length === 0 ? <p className="text-sm text-muted-foreground">No models registered.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Model</th><th className="pb-2 pr-4">Provider</th>
                    <th className="pb-2 pr-4">Cost/1K In</th><th className="pb-2 pr-4">Cost/1K Out</th>
                    <th className="pb-2 pr-4">Avg Latency</th><th className="pb-2 pr-4">Quality</th>
                    <th className="pb-2 pr-4">Capabilities</th>
                  </tr></thead>
                  <tbody>{models.map((m: any) => (
                    <tr key={m.model} className="border-b">
                      <td className="py-2 pr-4 font-medium">{m.model}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{m.provider}</td>
                      <td className="py-2 pr-4 text-muted-foreground">${m.cost_per_1k_input}</td>
                      <td className="py-2 pr-4 text-muted-foreground">${m.cost_per_1k_output}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{m.avg_latency_ms}ms</td>
                      <td className="py-2 pr-4">{(m.quality * 100).toFixed(0)}%</td>
                      <td className="py-2 pr-4 text-muted-foreground">{m.capabilities.join(", ") || "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
