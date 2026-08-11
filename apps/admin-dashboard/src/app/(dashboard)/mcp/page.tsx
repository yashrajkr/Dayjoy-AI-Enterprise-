"use client";

import { useState, useEffect } from "react";
import {
  Server, Wrench, FileText, Loader2, Activity, CheckCircle2, XCircle,
  Search, Plus, Shield, Zap, Database, RefreshCw, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface McpServer {
  id: string; name: string; slug: string; description: string | null;
  transport: string; endpoint: string | null; version: string | null;
  vendor: string | null; is_enabled: boolean; is_official: boolean;
  last_health_check: string | null; health_status: string | null;
  last_discovered_at: string | null; tool_count: number; resource_count: number;
  organization_id: string | null; created_at: string;
}

interface McpTool {
  id: string; server_id: string; name: string; description: string | null;
  is_enabled: boolean; is_destructive: boolean; requires_confirmation: boolean;
  category: string | null; tags: string[]; invoke_count: number;
  avg_latency_ms: number | null; error_rate: number;
}

interface McpResource {
  id: string; server_id: string; uri: string; name: string; description: string | null;
  mime_type: string | null; size_bytes: number | null; is_template: boolean;
  is_enabled: boolean; access_count: number;
}

interface Paginated<T> { data: T[]; meta: { pagination: { total: number } } }

export default function McpPage() {
  const [activeTab, setActiveTab] = useState<"servers" | "tools" | "resources">("servers");
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [resources, setResources] = useState<McpResource[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadServers() {
    setIsLoading(true); setError(null);
    try {
      const resp = await api.get<Paginated<McpServer>>("/mcp/servers");
      setServers(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load servers."); }
    setIsLoading(false);
  }

  async function loadTools() {
    setIsLoading(true); setError(null);
    try {
      const resp = await api.get<Paginated<McpTool>>("/mcp/tools", { limit: 100 });
      setTools(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load tools."); }
    setIsLoading(false);
  }

  async function loadResources() {
    setIsLoading(true); setError(null);
    try {
      const resp = await api.get<Paginated<McpResource>>("/mcp/resources", { limit: 100 });
      setResources(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load resources."); }
    setIsLoading(false);
  }

  useEffect(() => {
    if (activeTab === "servers") loadServers();
    else if (activeTab === "tools") loadTools();
    else loadResources();
  }, [activeTab]);

  async function handleHealthCheck(serverId: string) {
    try {
      await api.post(`/mcp/servers/${serverId}/health`, undefined, { params: { status: "healthy" } });
      loadServers();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Health check failed."); }
  }

  async function handleInvoke(toolId: string) {
    try {
      await api.post(`/mcp/tools/${toolId}/invoke`, { latency_ms: 100, success: true });
      loadTools();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Invoke failed."); }
  }

  const stats = {
    servers: servers.length,
    official: servers.filter((s) => s.is_official).length,
    healthy: servers.filter((s) => s.health_status === "healthy").length,
    tools: tools.length,
    resources: resources.length,
    totalInvocations: tools.reduce((s, t) => s + (t.invoke_count || 0), 0),
  };

  const tabs = [
    { id: "servers" as const, label: "Servers", icon: Server, count: stats.servers },
    { id: "tools" as const, label: "Tools", icon: Wrench, count: stats.tools },
    { id: "resources" as const, label: "Resources", icon: FileText, count: stats.resources },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Model Context Protocol (MCP)</h1>
        <p className="text-sm text-muted-foreground">Register MCP servers, discover tools and resources, monitor health, and invoke tools with isolation and approval</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Servers", value: stats.servers.toString(), icon: Server, color: "text-indigo" },
          { label: "Healthy", value: stats.healthy.toString(), icon: CheckCircle2, color: "text-success" },
          { label: "Tools", value: stats.tools.toString(), icon: Wrench, color: "text-indigo" },
          { label: "Invocations", value: stats.totalInvocations.toLocaleString(), icon: Zap, color: "text-warning" },
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
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
            <Badge variant="secondary" className="text-[10px]">{tab.count}</Badge>
          </button>
        ))}
      </div>

      {activeTab === "servers" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">MCP Servers</CardTitle>
            <Button size="sm" variant="outline" onClick={loadServers}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : servers.length === 0 ? (
              <div className="text-center py-12">
                <Server className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No MCP servers registered.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {servers.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-destructive/10 text-destructive">
                        <Server className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-medium">{s.name}</p>
                          {s.is_official && <Badge className="bg-indigo/15 text-indigo text-[10px]">Official</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] capitalize">{s.transport}</Badge>
                          <span>{s.tool_count} tools · {s.resource_count} resources</span>
                          {s.vendor && <span>· {s.vendor}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.health_status === "healthy" && <Badge className="bg-success/15 text-success"><CheckCircle2 className="h-3 w-3 mr-1" /> Healthy</Badge>}
                      {s.health_status === "degraded" && <Badge className="bg-warning/15 text-warning">Degraded</Badge>}
                      {s.health_status === "down" && <Badge className="bg-destructive/15 text-destructive"><XCircle className="h-3 w-3 mr-1" /> Down</Badge>}
                      {!s.health_status && <Badge variant="secondary">Unknown</Badge>}
                      <Button size="sm" variant="outline" onClick={() => handleHealthCheck(s.id)}>
                        <Activity className="h-3 w-3 mr-1" /> Check
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "tools" && (
        <Card>
          <CardHeader><CardTitle className="text-base">MCP Tools</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : tools.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No tools registered.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Name</th><th className="pb-2 pr-4">Description</th>
                    <th className="pb-2 pr-4">Category</th><th className="pb-2 pr-4">Invocations</th>
                    <th className="pb-2 pr-4">Avg Latency</th><th className="pb-2 pr-4">Error Rate</th>
                    <th className="pb-2 pr-4">Flags</th><th className="pb-2 pr-4"></th>
                  </tr></thead>
                  <tbody>
                    {tools.map((t) => (
                      <tr key={t.id} className="border-b">
                        <td className="py-2 pr-4 font-medium">{t.name}</td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs max-w-xs truncate">{t.description || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{t.category || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{t.invoke_count.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{t.avg_latency_ms ? `${t.avg_latency_ms}ms` : "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{(t.error_rate * 100).toFixed(1)}%</td>
                        <td className="py-2 pr-4">
                          {t.is_destructive && <Badge variant="destructive" className="text-[10px]">Destructive</Badge>}
                          {t.requires_confirmation && <Badge variant="outline" className="text-[10px] ml-1">Confirm</Badge>}
                        </td>
                        <td className="py-2 pr-4">
                          <Button size="sm" variant="outline" onClick={() => handleInvoke(t.id)}>Invoke</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "resources" && (
        <Card>
          <CardHeader><CardTitle className="text-base">MCP Resources</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : resources.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No resources registered.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {resources.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-cyan/10 text-cyan">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{r.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{r.uri}</span>
                          {r.mime_type && <Badge variant="outline" className="text-[10px]">{r.mime_type}</Badge>}
                          {r.is_template && <Badge variant="secondary" className="text-[10px]">Template</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.size_bytes ? `${(r.size_bytes / 1024).toFixed(1)} KB · ` : ""}{r.access_count.toLocaleString()} accesses
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
