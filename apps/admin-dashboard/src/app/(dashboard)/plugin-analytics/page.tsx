"use client";

import { useState, useEffect } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Download, Package, TrendingUp,
  Loader2, BarChart3, Calendar, TopPlugins, Award, Zap, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface Overview {
  period_days: number;
  total_installations: number;
  active_installations: number;
  healthy_installations: number;
  errored_installations: number;
  recent_installs: number;
  health_check_pass_rate: number;
  error_rate: number;
}

interface TimeSeries {
  metric: string;
  bucket: string;
  period_days: number;
  buckets: Array<{ bucket: string; count: number }>;
  total: number;
}

interface TopPlugin {
  id: string; name: string; slug: string; category: string;
  install_count: number; rating_avg: number; rating_count: number;
  is_verified: boolean; current_version: string; author_name: string | null;
}

interface ErrorItem {
  installation_id: string; plugin_name: string; version: string;
  status: string; health_status: string; error_message: string | null;
  last_health_check: string | null;
}

export default function PluginAnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeries | null>(null);
  const [topPlugins, setTopPlugins] = useState<TopPlugin[]>([]);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [activeMetric, setActiveMetric] = useState<"installs" | "uninstalls" | "errors" | "health_checks">("installs");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadOverview() {
    try {
      const resp = await api.get<{ data: Overview }>("/production/plugins/analytics/overview?days=30");
      setOverview(resp.data);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load overview."); }
  }
  async function loadTimeSeries() {
    try {
      const resp = await api.get<{ data: TimeSeries }>(`/production/plugins/analytics/time-series?metric=${activeMetric}&days=30&bucket=day`);
      setTimeSeries(resp.data);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load time series."); }
  }
  async function loadTopPlugins() {
    try {
      const resp = await api.get<{ data: { plugins: TopPlugin[] } }>("/production/plugins/analytics/top?limit=10");
      setTopPlugins(resp.data?.plugins || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load top plugins."); }
  }
  async function loadErrors() {
    try {
      const resp = await api.get<{ data: { total_errors: number; errors: ErrorItem[] } }>("/production/plugins/analytics/errors?days=7");
      setErrors(resp.data?.errors || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load errors."); }
  }

  useEffect(() => {
    setIsLoading(true); setError(null);
    Promise.all([loadOverview(), loadTimeSeries(), loadTopPlugins(), loadErrors()]).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { loadTimeSeries(); /* eslint-disable-next-line */ }, [activeMetric]);

  const maxBucket = Math.max(...(timeSeries?.buckets?.map((b) => b.count) || [1]), 1);

  if (isLoading && !overview) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plugin Analytics</h1>
        <p className="text-sm text-muted-foreground">Time-series insights into plugin installs, health, errors, and leaderboard</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Overview stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Installations", value: overview?.total_installations?.toLocaleString() || "0", icon: Package, color: "text-indigo" },
          { label: "Healthy", value: overview?.healthy_installations?.toLocaleString() || "0", icon: CheckCircle2, color: "text-success" },
          { label: "Errors (7d)", value: overview?.errored_installations?.toLocaleString() || "0", icon: AlertTriangle, color: "text-destructive" },
          { label: "Health Pass Rate", value: `${((overview?.health_check_pass_rate || 0) * 100).toFixed(1)}%`, icon: Activity, color: "text-indigo" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <div className="flex items-center gap-2">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      {/* Time series chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Time Series (30 days)
          </CardTitle>
          <div className="flex gap-1">
            {(["installs", "uninstalls", "errors", "health_checks"] as const).map((m) => (
              <button key={m} onClick={() => setActiveMetric(m)}
                className={`rounded px-3 py-1 text-xs ${activeMetric === m ? "bg-primary text-primary-foreground" : "bg-white/[0.04] text-muted-foreground"}`}>
                {m.replace("_", " ")}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {!timeSeries || timeSeries.buckets.length === 0 ? (
            <div className="text-center py-8">
              <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No data for this metric in the last 30 days.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total: <strong className="text-foreground/80">{timeSeries.total}</strong></span>
                <span>Bucket: {timeSeries.bucket}</span>
              </div>
              {/* Simple bar chart visualization */}
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {timeSeries.buckets.slice().reverse().map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-24 text-xs text-muted-foreground font-mono">
                      {b.bucket ? new Date(b.bucket).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                    </span>
                    <div className="flex-1 bg-white/[0.04] rounded h-5 relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-primary rounded transition-all"
                           style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                      <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-foreground/80">
                        {b.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-column: Top plugins + Errors */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4" /> Top Plugins</CardTitle></CardHeader>
          <CardContent>
            {topPlugins.length === 0 ? (
              <div className="text-center py-6">
                <Award className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No plugins yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topPlugins.map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between rounded border p-2">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${idx < 3 ? "bg-warning/15 text-warning" : "bg-white/[0.04] text-muted-foreground"}`}>
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-medium">{p.name}</p>
                          {p.is_verified && <CheckCircle2 className="h-3 w-3 text-indigo" />}
                        </div>
                        <p className="text-xs text-muted-foreground">{p.category || "uncategorized"} · v{p.current_version}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span><Download className="inline h-3 w-3 mr-1" />{p.install_count}</span>
                      <span>★ {p.rating_avg.toFixed(1)} ({p.rating_count})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><XCircle className="h-4 w-4 text-destructive" /> Recent Errors (7 days)</CardTitle></CardHeader>
          <CardContent>
            {errors.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="mx-auto h-10 w-10 text-success/70" />
                <p className="mt-2 text-sm text-muted-foreground">No errors in the last 7 days. 🎉</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {errors.map((e) => (
                  <div key={e.installation_id} className="rounded border border-destructive/30 bg-destructive/10 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{e.plugin_name}</p>
                      <Badge variant="destructive" className="text-[10px]">{e.health_status || e.status}</Badge>
                    </div>
                    <p className="text-xs text-destructive mt-1 truncate">{e.error_message || "Unknown error"}</p>
                    {e.last_health_check && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Last check: {new Date(e.last_health_check).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
