"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search, Star, Download, Package, Bot, Workflow, FileText, Database,
  Plug, Server, Code, Loader2, TrendingUp, CheckCircle2, Crown, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface MarketplaceItem {
  id: string; item_type: string; entity_id: string; name: string; slug: string;
  summary: string | null; description: string | null; tags: string[]; icon: string | null;
  version: string | null; visibility: string; status: string;
  is_featured: boolean; is_verified: boolean; is_free: boolean;
  price_cents: number; currency: string; download_count: number; install_count: number;
  view_count: number; rating_avg: number; rating_count: number;
  publisher_id: string | null; publisher_name: string | null; license: string | null;
  published_at: string | null; created_at: string;
}

interface PaginatedItems { data: MarketplaceItem[]; meta: { pagination: { total: number; skip: number; limit: number; has_next: boolean } } }

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  plugin: { label: "Plugins", icon: Plug, color: "text-indigo" },
  agent: { label: "Agents", icon: Bot, color: "text-indigo" },
  workflow: { label: "Workflows", icon: Workflow, color: "text-warning" },
  prompt: { label: "Prompts", icon: FileText, color: "text-success" },
  knowledge: { label: "Knowledge", icon: Database, color: "text-cyan" },
  template: { label: "Templates", icon: Package, color: "text-indigo" },
  connector: { label: "Connectors", icon: Plug, color: "text-indigo" },
  mcp: { label: "MCP Servers", icon: Server, color: "text-destructive" },
  api: { label: "APIs", icon: Code, color: "text-warning" },
  model: { label: "Models", icon: Sparkles, color: "text-warning" },
};

export default function MarketplacePage() {
  const [activeType, setActiveType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const limit = 24;

  async function loadItems() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, unknown> = { skip, limit };
      if (activeType !== "all") params.item_type = activeType;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      const resp = await api.get<PaginatedItems>("/marketplace/items", params);
      setItems(resp.data || []);
      setTotal(resp.meta?.pagination?.total || 0);
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Failed to load marketplace."); }
    setIsLoading(false);
  }

  useEffect(() => { setSkip(0); loadItems(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeType, searchQuery]);

  const stats = useMemo(() => {
    return {
      total,
      verified: items.filter((i) => i.is_verified).length,
      featured: items.filter((i) => i.is_featured).length,
      totalDownloads: items.reduce((sum, i) => sum + (i.download_count || 0), 0),
    };
  }, [items, total]);

  async function handleInstall(itemId: string) {
    try {
      await api.post(`/marketplace/items/${itemId}/download`, undefined, { params: { action: "install" } });
      loadItems();
    } catch (err: unknown) { setError((err as { message?: string })?.message || "Install failed."); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketplace</h1>
        <p className="text-sm text-muted-foreground">Discover and install plugins, agents, workflows, connectors, MCP servers, and more</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Items", value: stats.total.toLocaleString(), icon: Package, color: "text-indigo" },
          { label: "Verified", value: stats.verified.toLocaleString(), icon: CheckCircle2, color: "text-success" },
          { label: "Featured", value: stats.featured.toLocaleString(), icon: Crown, color: "text-warning" },
          { label: "Downloads", value: stats.totalDownloads.toLocaleString(), icon: Download, color: "text-indigo" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <div className="flex items-center gap-2">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search marketplace..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex flex-wrap gap-1 border-b">
        <button onClick={() => setActiveType("all")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${activeType === "all" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <Package className="h-4 w-4" /> All
        </button>
        {Object.entries(TYPE_META).map(([type, meta]) => (
          <button key={type} onClick={() => setActiveType(type)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${activeType === type ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <meta.icon className={`h-4 w-4 ${meta.color}`} /> {meta.label}
          </button>
        ))}
      </div>

      {/* Items grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No items found. Try a different search or category.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const meta = TYPE_META[item.item_type] || TYPE_META.plugin;
            return (
              <Card key={item.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] ${meta.color}`}>
                      <meta.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h3 className="truncate font-semibold">{item.name}</h3>
                        {item.is_verified && <CheckCircle2 className="h-4 w-4 text-indigo" />}
                        {item.is_featured && <Crown className="h-4 w-4 text-warning" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.publisher_name || "Anonymous"}</p>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground min-h-[2.5rem]">{item.summary || item.description || "No description available."}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                    ))}
                    {item.tags.length > 3 && <Badge variant="outline" className="text-[10px]">+{item.tags.length - 3}</Badge>}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Star className="h-3 w-3 text-warning" /> {item.rating_avg.toFixed(1)} ({item.rating_count})</span>
                      <span className="flex items-center gap-1"><Download className="h-3 w-3" /> {item.download_count}</span>
                    </div>
                    <Button size="sm" variant={item.is_free ? "default" : "outline"} onClick={() => handleInstall(item.id)}>
                      {item.is_free ? "Install" : `$${(item.price_cents / 100).toFixed(2)}`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Showing {skip + 1}-{Math.min(skip + limit, total)} of {total}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={skip === 0}
              onClick={() => { setSkip(Math.max(0, skip - limit)); }}>Previous</Button>
            <Button variant="outline" size="sm" disabled={skip + limit >= total}
              onClick={() => { setSkip(skip + limit); }}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
