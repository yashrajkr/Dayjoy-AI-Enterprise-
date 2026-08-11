"use client";

import { useState, useEffect } from "react";
import {
  Plug, Loader2, Search, CheckCircle2, XCircle, Server, Database,
  Cloud, MessageCircle, Code, DollarSign, Activity, Settings, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface Connector {
  id: string; name: string; slug: string; description: string | null;
  category: string; provider: string; tags: string[]; icon: string | null;
  auth_type: string; capabilities: string[]; webhook_supported: boolean;
  rate_limit_per_minute: number | null; documentation_url: string | null;
  is_official: boolean; is_verified: boolean; is_active: boolean;
  install_count: number; rating_avg: number; created_at: string;
}

interface ConnectorInstance {
  id: string; connector_id: string; organization_id: string; name: string;
  auth_type: string; config: Record<string, unknown>; status: string;
  last_sync_at: string | null; last_health_check: string | null;
  health_status: string | null; error_count: number; total_calls: number;
  has_credentials: boolean; created_at: string;
}

interface Paginated<T> { data: T[]; meta: { pagination: { total: number } } }

const CATEGORY_ICONS: Record<string, any> = {
  crm: Server,
  communication: MessageCircle,
  storage: Database,
  development: Code,
  database: Database,
  analytics: Activity,
  cloud: Cloud,
  payment: DollarSign,
};

export default function ConnectorsPage() {
  const [activeTab, setActiveTab] = useState<"catalog" | "instances">("catalog");
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [instances, setInstances] = useState<ConnectorInstance[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadCatalog() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, unknown> = {};
      if (search.trim()) params.search = search.trim();
      if (categoryFilter) params.category = categoryFilter;
      const [catResp, connResp] = await Promise.all([
        api.get<{ data: string[] }>("/connectors/categories"),
        api.get<Paginated<Connector>>("/connectors/catalog", params),
      ]);
      setCategories(catResp.data || []);
      setConnectors(connResp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load connectors."); }
    setIsLoading(false);
  }

  async function loadInstances() {
    setIsLoading(true); setError(null);
    try {
      const resp = await api.get<Paginated<ConnectorInstance>>("/connectors/instances");
      setInstances(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load instances."); }
    setIsLoading(false);
  }

  useEffect(() => {
    if (activeTab === "catalog") loadCatalog();
    else loadInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, categoryFilter]);

  async function handleHealthCheck(instanceId: string) {
    try {
      await api.post(`/connectors/instances/${instanceId}/health`, { status: "healthy" });
      loadInstances();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Health check failed."); }
  }

  async function handleDelete(instanceId: string) {
    if (!confirm("Delete this connector instance? Credentials will be wiped.")) return;
    try {
      await api.delete(`/connectors/instances/${instanceId}`);
      loadInstances();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Delete failed."); }
  }

  const stats = {
    total: connectors.length,
    official: connectors.filter((c) => c.is_official).length,
    instances: instances.length,
    healthy: instances.filter((i) => i.health_status === "healthy").length,
    totalCalls: instances.reduce((s, i) => s + (i.total_calls || 0), 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connectors</h1>
        <p className="text-sm text-muted-foreground">Enterprise connector hub — 35+ supported integrations across CRM, communication, storage, development, databases, analytics, cloud, and payments</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Catalog", value: stats.total.toString(), icon: Plug, color: "text-indigo" },
          { label: "Official", value: stats.official.toString(), icon: CheckCircle2, color: "text-success" },
          { label: "Active Instances", value: stats.instances.toString(), icon: Server, color: "text-indigo" },
          { label: "Total API Calls", value: stats.totalCalls.toLocaleString(), icon: Activity, color: "text-warning" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <div className="flex items-center gap-2">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button onClick={() => setActiveTab("catalog")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${activeTab === "catalog" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Plug className="h-4 w-4" /> Catalog
        </button>
        <button onClick={() => setActiveTab("instances")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${activeTab === "instances" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Server className="h-4 w-4" /> My Instances
        </button>
      </div>

      {activeTab === "catalog" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search connectors..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-md border border-border px-3 text-sm">
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : connectors.length === 0 ? (
            <Card><CardContent className="p-12 text-center">
              <Plug className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No connectors found.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {connectors.map((c) => {
                const Icon = CATEGORY_ICONS[c.category] || Plug;
                return (
                  <Card key={c.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo/10 text-indigo">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <h3 className="truncate font-semibold text-sm">{c.name}</h3>
                            {c.is_official && <Badge className="bg-indigo/15 text-indigo text-[10px]">Official</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground capitalize">{c.category} · {c.provider}</p>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground min-h-[2rem]">{c.description || "No description."}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.capabilities.slice(0, 4).map((cap) => (
                          <Badge key={cap} variant="outline" className="text-[10px] capitalize">{cap}</Badge>
                        ))}
                        {c.webhook_supported && <Badge variant="secondary" className="text-[10px]">Webhook</Badge>}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t pt-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] capitalize">{c.auth_type}</Badge>
                          <span>{c.install_count} installs</span>
                        </div>
                        <Button size="sm" variant="outline">Connect</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "instances" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Connected Instances</CardTitle>
            <Button size="sm" variant="outline" onClick={loadInstances}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : instances.length === 0 ? (
              <div className="text-center py-12">
                <Server className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No connector instances yet.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setActiveTab("catalog")}>Browse Catalog</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {instances.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between rounded border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-indigo/10 text-indigo">
                        <Server className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{inst.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] capitalize">{inst.auth_type}</Badge>
                          <span>{inst.total_calls.toLocaleString()} calls</span>
                          {inst.has_credentials && <Badge variant="secondary" className="text-[10px]">Secured</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {inst.health_status === "healthy" && <Badge className="bg-success/15 text-success"><CheckCircle2 className="h-3 w-3 mr-1" /> Healthy</Badge>}
                      {inst.health_status === "degraded" && <Badge className="bg-warning/15 text-warning">Degraded</Badge>}
                      {inst.health_status === "down" && <Badge className="bg-destructive/15 text-destructive"><XCircle className="h-3 w-3 mr-1" /> Down</Badge>}
                      <Button size="sm" variant="outline" onClick={() => handleHealthCheck(inst.id)}>
                        <Activity className="h-3 w-3 mr-1" /> Check
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(inst.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
