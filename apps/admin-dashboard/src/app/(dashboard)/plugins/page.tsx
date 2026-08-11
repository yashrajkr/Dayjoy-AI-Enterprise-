"use client";

import { useState, useEffect } from "react";
import {
  Plug, Loader2, Star, Download, Settings, Shield, Package, Activity,
  AlertTriangle, CheckCircle2, XCircle, Search, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface Plugin {
  id: string; name: string; slug: string; description: string | null;
  category: string | null; tags: string[]; author_name: string | null;
  current_version: string; runtime: string; entrypoint: string;
  is_published: boolean; is_verified: boolean; is_featured: boolean;
  install_count: number; rating_avg: number; rating_count: number;
  license: string | null; status: string; organization_id: string | null;
  created_at: string;
}

interface Installation {
  id: string; plugin_id: string; version_id: string | null;
  organization_id: string; installed_by: string | null; version: string;
  config: Record<string, unknown>; granted_permissions: string[];
  status: string; is_sandboxed: boolean; last_health_check: string | null;
  health_status: string | null; error_message: string | null;
  installed_at: string;
}

interface Paginated<T> { data: T[]; meta: { pagination: { total: number } } }

export default function PluginsPage() {
  const [activeTab, setActiveTab] = useState<"catalog" | "installed">("catalog");
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadCatalog() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, unknown> = { is_published: true };
      if (search.trim()) params.search = search.trim();
      const resp = await api.get<Paginated<Plugin>>("/plugins", params);
      setPlugins(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load plugins."); }
    setIsLoading(false);
  }

  async function loadInstallations() {
    setIsLoading(true); setError(null);
    try {
      const resp = await api.get<Paginated<Installation>>("/plugins/installations");
      setInstallations(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load installations."); }
    setIsLoading(false);
  }

  useEffect(() => {
    if (activeTab === "catalog") loadCatalog();
    else loadInstallations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search]);

  async function handleInstall(pluginId: string) {
    try {
      await api.post(`/plugins/${pluginId}/install`, { config: {}, granted_permissions: [] });
      loadCatalog();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Install failed."); }
  }

  async function handleUninstall(installationId: string) {
    try {
      await api.delete(`/plugins/installations/${installationId}`);
      loadInstallations();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Uninstall failed."); }
  }

  async function handleHealthCheck(installationId: string) {
    try {
      await api.post(`/plugins/installations/${installationId}/health`, { status: "healthy" });
      loadInstallations();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Health check failed."); }
  }

  const stats = {
    totalPlugins: plugins.length,
    verified: plugins.filter((p) => p.is_verified).length,
    totalInstalls: plugins.reduce((s, p) => s + p.install_count, 0),
    installed: installations.length,
    healthy: installations.filter((i) => i.health_status === "healthy").length,
    errored: installations.filter((i) => i.health_status === "error" || i.status === "error").length,
  };

  const tabs = [
    { id: "catalog" as const, label: "Catalog", icon: Package },
    { id: "installed" as const, label: "Installed", icon: Plug },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plugins</h1>
        <p className="text-sm text-muted-foreground">Browse, install, and manage ecosystem plugins with sandboxing and permissions</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: activeTab === "catalog" ? "Available Plugins" : "Installed", value: (activeTab === "catalog" ? stats.totalPlugins : stats.installed).toLocaleString(), icon: Package, color: "text-indigo" },
          { label: "Verified", value: stats.verified.toLocaleString(), icon: CheckCircle2, color: "text-success" },
          { label: "Total Installs", value: stats.totalInstalls.toLocaleString(), icon: Download, color: "text-indigo" },
          { label: "Healthy", value: stats.healthy.toLocaleString(), icon: Activity, color: "text-success" },
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
          </button>
        ))}
      </div>

      {activeTab === "catalog" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search plugins..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : plugins.length === 0 ? (
            <Card><CardContent className="p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No plugins found.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plugins.map((plugin) => (
                <Card key={plugin.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo/10 text-indigo">
                        <Plug className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <h3 className="truncate font-semibold">{plugin.name}</h3>
                          {plugin.is_verified && <CheckCircle2 className="h-4 w-4 text-indigo" />}
                          {plugin.is_featured && <Badge className="bg-warning/15 text-warning text-[10px]">Featured</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{plugin.author_name || "Anonymous"} · v{plugin.current_version}</p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground min-h-[2.5rem]">{plugin.description || "No description."}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {plugin.category && <Badge variant="secondary" className="text-[10px]">{plugin.category}</Badge>}
                      {plugin.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t pt-3">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Star className="h-3 w-3 text-warning" /> {plugin.rating_avg.toFixed(1)}</span>
                        <span className="flex items-center gap-1"><Download className="h-3 w-3" /> {plugin.install_count}</span>
                      </div>
                      <Button size="sm" onClick={() => handleInstall(plugin.id)}>Install</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "installed" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Installed Plugins</CardTitle>
            <Button size="sm" variant="outline" onClick={loadInstallations}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : installations.length === 0 ? (
              <div className="text-center py-12">
                <Plug className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No plugins installed yet.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setActiveTab("catalog")}>Browse Catalog</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {installations.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between rounded border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-indigo/10 text-indigo">
                        <Plug className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Plugin ID: {inst.plugin_id.slice(0, 8)}...</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>v{inst.version}</span>
                          <span>·</span>
                          <span>Installed {new Date(inst.installed_at).toLocaleDateString()}</span>
                          {inst.is_sandboxed && <Badge variant="outline" className="text-[10px]">Sandboxed</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {inst.health_status === "healthy" && <Badge className="bg-success/15 text-success"><CheckCircle2 className="h-3 w-3 mr-1" /> Healthy</Badge>}
                      {inst.health_status === "error" && <Badge className="bg-destructive/15 text-destructive"><XCircle className="h-3 w-3 mr-1" /> Error</Badge>}
                      {inst.status === "disabled" && <Badge variant="secondary">Disabled</Badge>}
                      <Button size="sm" variant="outline" onClick={() => handleHealthCheck(inst.id)}>
                        <Activity className="h-3 w-3 mr-1" /> Check
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleUninstall(inst.id)}>
                        Uninstall
                      </Button>
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
