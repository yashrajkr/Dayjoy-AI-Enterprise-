"use client";

import { useState, useEffect } from "react";
import {
  Code, Key, Download, Package, Loader2, Star, RefreshCw, FileText,
  Server, Activity, Zap, AlertCircle, Copy, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface DeveloperApp {
  id: string; name: string; slug: string; description: string | null;
  client_id: string; app_type: string; redirect_uris: string[]; scopes: string[];
  rate_limit_per_minute: number; rate_limit_per_day: number;
  is_active: boolean; is_verified: boolean; homepage_url: string | null;
  logo_url: string | null; contact_email: string | null; webhook_url: string | null;
  total_requests: number; last_request_at: string | null;
  created_by: string | null; created_at: string;
}

interface ApiCatalogEntry {
  id: string; name: string; slug: string; description: string | null;
  api_type: string; base_url: string | null; version: string;
  auth_type: string | null; documentation_url: string | null;
  is_published: boolean; is_featured: boolean; category: string | null;
  tags: string[]; endpoints_count: number; created_at: string;
}

interface SdkRelease {
  id: string; language: string; version: string; name: string; description: string | null;
  package_url: string | null; repository_url: string | null;
  documentation_url: string | null; download_url: string | null;
  checksum: string | null; size_bytes: number | null;
  min_runtime_version: string | null; release_notes: string | null;
  is_stable: boolean; is_active: boolean; download_count: number;
  published_at: string | null; created_at: string;
}

interface Paginated<T> { data: T[]; meta: { pagination: { total: number } } }

const LANGUAGE_COLORS: Record<string, string> = {
  python: "text-indigo",
  typescript: "text-indigo",
  javascript: "text-warning",
  go: "text-cyan",
  java: "text-destructive",
  csharp: "text-success",
  rust: "text-warning",
};

export default function DeveloperPage() {
  const [activeTab, setActiveTab] = useState<"apps" | "apis" | "sdks">("apps");
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [apis, setApis] = useState<ApiCatalogEntry[]>([]);
  const [sdks, setSdks] = useState<SdkRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState<{ [appId: string]: string }>({});

  async function loadApps() {
    setIsLoading(true); setError(null);
    try {
      const resp = await api.get<Paginated<DeveloperApp>>("/developer/apps");
      setApps(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load apps."); }
    setIsLoading(false);
  }

  async function loadApis() {
    setIsLoading(true); setError(null);
    try {
      const resp = await api.get<Paginated<ApiCatalogEntry>>("/developer/apis");
      setApis(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load APIs."); }
    setIsLoading(false);
  }

  async function loadSdks() {
    setIsLoading(true); setError(null);
    try {
      const resp = await api.get<Paginated<SdkRelease>>("/developer/sdks");
      setSdks(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load SDKs."); }
    setIsLoading(false);
  }

  useEffect(() => {
    if (activeTab === "apps") loadApps();
    else if (activeTab === "apis") loadApis();
    else loadSdks();
  }, [activeTab]);

  async function handleRotateSecret(appId: string) {
    if (!confirm("Rotate this app's client secret? The old one will be invalidated immediately.")) return;
    try {
      const resp = await api.post<{ data: { client_id: string; client_secret: string } }>(`/developer/apps/${appId}/rotate-secret`);
      setShowSecret({ ...showSecret, [appId]: resp.data.client_secret });
      loadApps();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Rotation failed."); }
  }

  async function handleDownloadSdk(sdkId: string) {
    try { await api.post(`/developer/sdks/${sdkId}/download`); loadSdks(); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Download tracking failed."); }
  }

  const stats = {
    apps: apps.length,
    apis: apis.length,
    sdks: sdks.length,
    totalRequests: apps.reduce((s, a) => s + (a.total_requests || 0), 0),
    totalSdkDownloads: sdks.reduce((s, sdk) => s + (sdk.download_count || 0), 0),
  };

  const tabs = [
    { id: "apps" as const, label: "Applications", icon: Code, count: stats.apps },
    { id: "apis" as const, label: "API Catalog", icon: Server, count: stats.apis },
    { id: "sdks" as const, label: "SDKs", icon: Package, count: stats.sdks },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Developer Portal</h1>
        <p className="text-sm text-muted-foreground">Manage OAuth applications, browse the API catalog, and download SDKs in 7 languages</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Apps", value: stats.apps.toString(), icon: Code, color: "text-indigo" },
          { label: "APIs Published", value: stats.apis.toString(), icon: Server, color: "text-indigo" },
          { label: "SDKs Available", value: stats.sdks.toString(), icon: Package, color: "text-success" },
          { label: "API Requests", value: stats.totalRequests.toLocaleString(), icon: Activity, color: "text-warning" },
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

      {activeTab === "apps" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Your Applications</CardTitle>
            <Button size="sm" variant="outline" onClick={loadApps}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : apps.length === 0 ? (
              <div className="text-center py-12">
                <Code className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No apps registered yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {apps.map((app) => (
                  <div key={app.id} className="rounded border p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{app.name}</h3>
                          <Badge variant="outline" className="text-[10px] capitalize">{app.app_type}</Badge>
                          {app.is_verified && <Badge className="bg-indigo/15 text-indigo text-[10px]">Verified</Badge>}
                          {!app.is_active && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{app.description || "No description"}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleRotateSecret(app.id)}>
                        <Key className="h-3 w-3 mr-1" /> Rotate Secret
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Client ID:</span>
                        <code className="ml-1 font-mono text-foreground/80">{app.client_id}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Rate limits:</span>
                        <span className="ml-1 text-foreground/80">{app.rate_limit_per_minute}/min · {app.rate_limit_per_day}/day</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total requests:</span>
                        <span className="ml-1 text-foreground/80">{app.total_requests.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Scopes:</span>
                        <span className="ml-1 text-foreground/80">{app.scopes.length ? app.scopes.join(", ") : "—"}</span>
                      </div>
                    </div>
                    {showSecret[app.id] && (
                      <div className="mt-3 rounded-md bg-warning/10 border border-warning/30 p-3 text-xs">
                        <div className="flex items-center gap-1 text-warning font-medium mb-1">
                          <AlertCircle className="h-3 w-3" /> New client secret (save now — won't be shown again):
                        </div>
                        <code className="font-mono text-warning break-all">{showSecret[app.id]}</code>
                        <Button size="sm" variant="ghost" className="mt-1 h-6"
                          onClick={() => navigator.clipboard?.writeText(showSecret[app.id])}>
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "apis" && (
        <Card>
          <CardHeader><CardTitle className="text-base">API Catalog</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : apis.length === 0 ? (
              <div className="text-center py-12">
                <Server className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No APIs published yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {apis.map((api) => (
                  <div key={api.id} className="flex items-center justify-between rounded border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-warning/10 text-warning">
                        <Server className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-medium">{api.name}</p>
                          <Badge variant="outline" className="text-[10px] uppercase">{api.api_type}</Badge>
                          <Badge variant="secondary" className="text-[10px]">v{api.version}</Badge>
                          {api.is_published && <Badge className="bg-success/15 text-success text-[10px]">Published</Badge>}
                          {api.is_featured && <Badge className="bg-warning/15 text-warning text-[10px]">Featured</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{api.endpoints_count} endpoints · {api.base_url || "No base URL"}</p>
                      </div>
                    </div>
                    {api.documentation_url && (
                      <a href={api.documentation_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline"><ExternalLink className="h-3 w-3 mr-1" /> Docs</Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "sdks" && (
        <Card>
          <CardHeader><CardTitle className="text-base">SDK Releases</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : sdks.length === 0 ? (
              <div className="text-center py-12">
                <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No SDKs published yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {sdks.map((sdk) => (
                  <Card key={sdk.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] ${LANGUAGE_COLORS[sdk.language] || "text-muted-foreground"}`}>
                          <Code className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <h3 className="truncate font-semibold text-sm">{sdk.name}</h3>
                            {sdk.is_stable && <Badge className="bg-success/15 text-success text-[10px]">Stable</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{sdk.language} · v{sdk.version}</p>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground min-h-[2rem]">{sdk.description || sdk.release_notes || "No description."}</p>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {sdk.size_bytes ? `${(sdk.size_bytes / 1024).toFixed(0)} KB · ` : ""}{sdk.download_count.toLocaleString()} downloads
                      </div>
                      <div className="mt-3 flex items-center gap-2 border-t pt-3">
                        <Button size="sm" variant="default" onClick={() => handleDownloadSdk(sdk.id)}>
                          <Download className="h-3 w-3 mr-1" /> Download
                        </Button>
                        {sdk.documentation_url && (
                          <a href={sdk.documentation_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline"><FileText className="h-3 w-3 mr-1" /> Docs</Button>
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
