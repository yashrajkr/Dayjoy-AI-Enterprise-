"use client";

import { useState, useEffect } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Database, Server, Users, Box,
  Workflow, Bot, FileText, DollarSign, ShoppingBag, Phone, Loader2,
  RefreshCw, Network, Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface Twin {
  id: string; twin_type: string; entity_id: string; name: string;
  slug: string; description: string | null;
  health_score: number; risk_score: number; anomaly_score: number;
  is_active: boolean; last_snapshot_at: string | null;
  created_at: string;
}

interface Paginated<T> { data: T[]; meta: { pagination: { total: number } } }

const TWIN_TYPE_ICONS: Record<string, any> = {
  organization: Layers, department: Layers, employee: Users, customer: Users,
  lead: Users, sales_pipeline: DollarSign, inventory: Box, product: Box,
  finance: DollarSign, project: Workflow, marketing: ShoppingBag,
  support: Phone, knowledge_base: FileText, ai_agent: Bot, workflow: Workflow,
  infrastructure: Server, server: Server, database: Database, api_service: Network,
};

export default function DigitalTwinsPage() {
  const [twins, setTwins] = useState<Twin[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTwins() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, unknown> = { limit: 200 };
      if (filterType !== "all") params.twin_type = filterType;
      const resp = await api.get<Paginated<Twin>>("/enterprise-os/digital-twins", params);
      setTwins(resp.data || []);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load twins."); }
    setIsLoading(false);
  }

  useEffect(() => { loadTwins(); /* eslint-disable-next-line */ }, [filterType]);

  const stats = {
    total: twins.length,
    healthy: twins.filter((t) => t.health_score >= 80).length,
    atRisk: twins.filter((t) => t.health_score < 80 && t.health_score >= 50).length,
    critical: twins.filter((t) => t.health_score < 50 || t.anomaly_score > 0.5).length,
  };

  const twinTypes = Array.from(new Set(twins.map((t) => t.twin_type)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Digital Twins</h1>
          <p className="text-sm text-muted-foreground">Virtual replicas of organization entities with live state, health, and risk monitoring</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadTwins}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Twins", value: stats.total, icon: Layers, color: "text-indigo" },
          { label: "Healthy", value: stats.healthy, icon: CheckCircle2, color: "text-success" },
          { label: "At Risk", value: stats.atRisk, icon: AlertTriangle, color: "text-warning" },
          { label: "Critical", value: stats.critical, icon: AlertTriangle, color: "text-destructive" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <div className="flex items-center gap-2">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        <button onClick={() => setFilterType("all")}
          className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium ${filterType === "all" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          All
        </button>
        {twinTypes.map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium ${filterType === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : twins.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No digital twins yet. Create one via the API.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {twins.map((t) => {
            const Icon = TWIN_TYPE_ICONS[t.twin_type] || Layers;
            const healthColor = t.health_score >= 80 ? "text-success" :
                                t.health_score >= 50 ? "text-warning" : "text-destructive";
            return (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo/10 text-indigo">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{t.twin_type.replace("_", " ")}</p>
                      </div>
                    </div>
                    {t.anomaly_score > 0.5 && <Badge variant="destructive" className="text-[10px]">Anomaly</Badge>}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{t.description || "No description"}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Health</p>
                      <p className={`text-sm font-semibold ${healthColor}`}>{t.health_score.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Risk</p>
                      <p className="text-sm font-semibold text-foreground/80">{t.risk_score.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Anomaly</p>
                      <p className="text-sm font-semibold text-foreground/80">{t.anomaly_score.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
