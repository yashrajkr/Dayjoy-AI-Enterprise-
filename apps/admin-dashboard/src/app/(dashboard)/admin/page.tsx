"use client";

import { useState, useEffect } from "react";
import { Building2, Users, CreditCard, DollarSign, Activity, Key, Lock, Settings, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface PlatformStats {
  total_organizations: number; total_users: number; active_subscriptions: number;
  api_calls_24h: number; total_cost_24h_cents: number;
}

interface UsageSummary {
  period_days: number; total_calls: number; total_tokens: number;
  total_cost_cents: number; avg_latency_ms: number;
}

interface Quota {
  max_users: number; max_agents: number; max_workflows: number;
  max_documents: number; max_tokens_per_month: number; max_storage_mb: number;
  max_api_keys: number; max_voice_minutes_per_month: number;
}

interface ApiKey {
  id: string; name: string; key_prefix: string; is_active: boolean;
  last_used_at: string | null; expires_at: string | null;
}

interface Plan {
  id: string; name: string; price_monthly: number; price_yearly: number;
  currency: string; trial_days: number;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "usage" | "billing" | "apikeys" | "secrets" | "settings">("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overview
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  // Billing
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null);
  // Secrets
  const [secrets, setSecrets] = useState<any[]>([]);
  const [showCreateSecret, setShowCreateSecret] = useState(false);
  const [secretName, setSecretName] = useState("");
  const [secretType, setSecretType] = useState("openai_key");
  const [secretValue, setSecretValue] = useState("");
  // Quotas
  const [quota, setQuota] = useState<Quota | null>(null);
  // Settings
  const [settings, setSettings] = useState<any>(null);

  async function loadOverview() {
    try {
      const [statsResp, usageResp] = await Promise.all([
        api.get<{ data: PlatformStats }>("/enterprise/admin/platform-stats"),
        api.get<{ data: UsageSummary }>("/enterprise/usage/summary"),
      ]);
      setStats(statsResp.data); setUsage(usageResp.data);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }

  async function loadBilling() {
    try {
      const [plansResp, invResp] = await Promise.all([
        api.get<{ data: Plan[] }>("/enterprise/billing/plans"),
        api.get<{ data: any[] }>("/enterprise/billing/invoices"),
      ]);
      setPlans(plansResp.data); setInvoices(invResp.data);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }

  async function loadApiKeys() {
    try { const resp = await api.get<{ data: ApiKey[] }>("/enterprise/api-keys"); setApiKeys(resp.data); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }

  async function loadSecrets() {
    try { const resp = await api.get<{ data: any[] }>("/enterprise/secrets"); setSecrets(resp.data); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }

  async function loadQuotas() {
    try { const resp = await api.get<{ data: Quota }>("/enterprise/quotas"); setQuota(resp.data); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }

  async function loadSettings() {
    try { const resp = await api.get<{ data: any }>("/enterprise/settings"); setSettings(resp.data); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Load failed."); }
  }

  useEffect(() => {
    setIsLoading(true); setError(null);
    if (activeTab === "overview") loadOverview();
    if (activeTab === "billing") loadBilling();
    if (activeTab === "apikeys") loadApiKeys();
    if (activeTab === "secrets") loadSecrets();
    if (activeTab === "settings") { loadQuotas(); loadSettings(); }
    setIsLoading(false);
  }, [activeTab]);

  async function handleCreateKey() {
    setError(null); setNewKeyResult(null);
    try {
      const resp = await api.post<{ data: { key: string; name: string } }>("/enterprise/api-keys", {
        name: newKeyName, scopes: [], rate_limit_per_minute: 60, expires_in_days: 365,
      });
      setNewKeyResult(resp.data.key);
      setNewKeyName(""); setShowCreateKey(false); await loadApiKeys();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Create failed."); }
  }

  async function handleStoreSecret() {
    setError(null);
    try {
      await api.post("/enterprise/secrets", { name: secretName, secret_type: secretType, value: secretValue });
      setSecretName(""); setSecretValue(""); setShowCreateSecret(false); await loadSecrets();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Store failed."); }
  }

  async function handleRevokeKey(id: string) {
    if (!confirm("Revoke this API key?")) return;
    try { await api.delete(`/enterprise/api-keys/${id}`); await loadApiKeys(); }
    catch (err: unknown) { setError((err as { message?: string })?.message || "Revoke failed."); }
  }

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Activity },
    { id: "billing" as const, label: "Billing", icon: CreditCard },
    { id: "apikeys" as const, label: "API Keys", icon: Key },
    { id: "secrets" as const, label: "Secrets", icon: Lock },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  if (isLoading && !stats) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Enterprise Admin</h1><p className="text-sm text-muted-foreground">Platform control plane</p></div>
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && stats && usage && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: "Organizations", value: stats.total_organizations, icon: Building2, color: "text-indigo" },
              { label: "Users", value: stats.total_users, icon: Users, color: "text-success" },
              { label: "Active Subs", value: stats.active_subscriptions, icon: CreditCard, color: "text-indigo" },
              { label: "API Calls (24h)", value: stats.api_calls_24h.toLocaleString(), icon: Activity, color: "text-warning" },
              { label: "Cost (24h)", value: `$${(stats.total_cost_24h_cents / 100).toFixed(2)}`, icon: DollarSign, color: "text-destructive" },
            ].map((s) => (
              <Card key={s.label}><CardContent className="p-4">
                <div className="flex items-center gap-2"><s.icon className={`h-5 w-5 ${s.color}`} />
                  <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
                </div>
              </CardContent></Card>
            ))}
          </div>
          <Card><CardHeader><CardTitle className="text-base">Usage Summary ({usage.period_days} days)</CardTitle></CardHeader>
            <CardContent><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div><p className="text-2xl font-bold">{usage.total_calls.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total API Calls</p></div>
              <div><p className="text-2xl font-bold">{usage.total_tokens.toLocaleString()}</p><p className="text-xs text-muted-foreground">Tokens Used</p></div>
              <div><p className="text-2xl font-bold">${(usage.total_cost_cents / 100).toFixed(2)}</p><p className="text-xs text-muted-foreground">Total Cost</p></div>
              <div><p className="text-2xl font-bold">{usage.avg_latency_ms}ms</p><p className="text-xs text-muted-foreground">Avg Latency</p></div>
            </div></CardContent>
          </Card>
        </div>
      )}

      {activeTab === "billing" && (
        <div className="space-y-6">
          <div><h2 className="text-lg font-semibold">Subscription Plans</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => (
                <Card key={p.id}><CardContent className="p-4">
                  <p className="font-bold">{p.name}</p>
                  <p className="text-2xl font-bold">${(p.price_monthly / 100).toFixed(2)}<span className="text-sm text-muted-foreground">/mo</span></p>
                  <p className="text-xs text-muted-foreground">${(p.price_yearly / 100).toFixed(2)}/year · {p.trial_days}d trial</p>
                </CardContent></Card>
              ))}
            </div>
          </div>
          <Card><CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
            <CardContent>{invoices.length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet.</p> : (
              <div className="space-y-2">{invoices.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <span className="font-mono text-xs">{inv.invoice_number}</span>
                  <span>${(inv.total_cents / 100).toFixed(2)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${inv.status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{inv.status}</span>
                </div>
              ))}</div>
            )}</CardContent>
          </Card>
        </div>
      )}

      {activeTab === "apikeys" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateKey(!showCreateKey)}><Key className="mr-2 h-4 w-4" /> New Key</Button>
          </div>
          {showCreateKey && (
            <Card><CardContent className="p-4">
              <div className="flex gap-2">
                <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name (e.g., CI Script)" />
                <Button onClick={handleCreateKey}>Create</Button>
              </div>
            </CardContent></Card>
          )}
          {newKeyResult && (
            <Card><CardContent className="p-4">
              <p className="text-sm font-medium text-success">API Key Created (copy now — shown only once):</p>
              <pre className="mt-2 rounded bg-white/[0.02] p-2 text-xs font-mono break-all whitespace-pre-wrap">{newKeyResult}</pre>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setNewKeyResult(null)}>Dismiss</Button>
            </CardContent></Card>
          )}
          <Card><CardContent>
            {apiKeys.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No API keys yet.</p> : (
              <div className="space-y-2">{apiKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div><span className="font-medium">{k.name}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{k.key_prefix}</span></div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${k.is_active ? "text-success" : "text-muted-foreground"}`}>{k.is_active ? "Active" : "Revoked"}</span>
                    {k.is_active && <Button size="sm" variant="outline" onClick={() => handleRevokeKey(k.id)} className="h-7 text-xs text-destructive">Revoke</Button>}
                  </div>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </div>
      )}

      {activeTab === "secrets" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateSecret(!showCreateSecret)}><Lock className="mr-2 h-4 w-4" /> New Secret</Button>
          </div>
          {showCreateSecret && (
            <Card><CardContent className="p-4 space-y-3">
              <div className="space-y-2"><Label>Name</Label><Input value={secretName} onChange={(e) => setSecretName(e.target.value)} placeholder="openai_api_key" /></div>
              <div className="space-y-2"><Label>Type</Label>
                <select value={secretType} onChange={(e) => setSecretType(e.target.value)} className="w-full rounded-md border border-border p-2">
                  <option value="openai_key">OpenAI API Key</option><option value="anthropic_key">Anthropic API Key</option>
                  <option value="gemini_key">Gemini API Key</option><option value="groq_key">Groq API Key</option>
                  <option value="twilio_key">Twilio Credentials</option><option value="smtp_key">SMTP Password</option>
                  <option value="database_url">Database URL</option><option value="custom">Custom</option>
                </select>
              </div>
              <div className="space-y-2"><Label>Value</Label><Input type="password" value={secretValue} onChange={(e) => setSecretValue(e.target.value)} placeholder="sk-..." /></div>
              <Button onClick={handleStoreSecret}>Store Secret</Button>
            </CardContent></Card>
          )}
          <Card><CardContent>
            {secrets.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No secrets stored.</p> : (
              <div className="space-y-2">{secrets.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div><span className="font-medium">{s.name}</span><span className="ml-2 text-xs text-muted-foreground">{s.secret_type}</span></div>
                  <span className="text-xs text-muted-foreground">{s.last_rotated_at ? `Rotated: ${new Date(s.last_rotated_at).toLocaleDateString()}` : "Never rotated"}</span>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </div>
      )}

      {activeTab === "settings" && quota && settings && (
        <div className="space-y-6">
          <Card><CardHeader><CardTitle className="text-base">Resource Quotas</CardTitle></CardHeader>
            <CardContent><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Object.entries(quota).filter(([k]) => k.startsWith("max_")).map(([key, val]) => (
                <div key={key} className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">{key.replace(/max_/g, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
                  <p className="text-xl font-bold">{val === -1 ? "∞" : val as number}</p>
                </div>
              ))}
            </div></CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-base">Tenant Settings</CardTitle></CardHeader>
            <CardContent><div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-muted-foreground">Timezone</p><p className="font-medium">{settings.timezone || "UTC"}</p></div>
              <div><p className="text-xs text-muted-foreground">Locale</p><p className="font-medium">{settings.locale || "en"}</p></div>
              <div><p className="text-xs text-muted-foreground">Custom Domain</p><p className="font-medium">{settings.custom_domain || "None"}</p></div>
              <div><p className="text-xs text-muted-foreground">Default AI Provider</p><p className="font-medium">{settings.default_ai_provider || "None"}</p></div>
            </div></CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
