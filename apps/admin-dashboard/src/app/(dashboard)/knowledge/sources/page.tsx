"use client";

import { useEffect, useState } from "react";
import {
  Database,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Globe,
  HelpCircle,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { knowledgeApi, type KnowledgeSource } from "@/lib/api";

const sourceTypeIcons: Record<string, React.ElementType> = {
  web: Globe,
  faq: HelpCircle,
  manual: FileText,
};

export default function KnowledgeSourcesPage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeSource | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("web");
  const [description, setDescription] = useState("");
  const [configJson, setConfigJson] = useState('{\n  "seed_url": "https://example.com"\n}');
  const [syncInterval, setSyncInterval] = useState("1440");
  const [creating, setCreating] = useState(false);

  const loadSources = async () => {
    try {
      setLoading(true);
      const data = await knowledgeApi.listSources();
      setSources(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  const handleCreate = async () => {
    try {
      setCreating(true);
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(configJson);
      } catch {
        setError("Config JSON is invalid");
        return;
      }
      await knowledgeApi.createSource({
        name,
        source_type: sourceType,
        config,
        description: description || undefined,
        sync_interval_minutes: syncInterval ? Number(syncInterval) : undefined,
      });
      setCreateOpen(false);
      setName("");
      setDescription("");
      setConfigJson('{\n  "seed_url": "https://example.com"\n}');
      setSyncInterval("1440");
      await loadSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await knowledgeApi.deleteSource(deleteTarget.id);
      setDeleteTarget(null);
      await loadSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Knowledge Sources</h1>
          <p className="text-sm text-muted-foreground">
            Manage external sources (websites, FAQs, integrations) that produce documents
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadSources()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Source
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Knowledge Source</DialogTitle>
                <DialogDescription>
                  A source can produce multiple documents (e.g., a website crawl produces N page documents).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Source Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Company Website"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Source Type</Label>
                    <select
                      id="type"
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="web">Website (crawl)</option>
                      <option value="faq">FAQ (curated)</option>
                      <option value="manual">Manual (typed)</option>
                      <option value="confluence">Confluence (future)</option>
                      <option value="notion">Notion (future)</option>
                      <option value="gdrive">Google Drive (future)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sync">Sync Interval (minutes)</Label>
                    <Input
                      id="sync"
                      type="number"
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(e.target.value)}
                      placeholder="1440 (daily)"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Description (optional)</Label>
                  <Input
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this source contain?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="config">Config (JSON)</Label>
                  <Textarea
                    id="config"
                    value={configJson}
                    onChange={(e) => setConfigJson(e.target.value)}
                    className="min-h-[120px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    For <code>web</code>: <code>{`{"seed_url": "https://..."}`}</code>.
                    For <code>faq</code>: <code>{`{"faq_entries": [...]}`}</code>.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !name.trim()}
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Source"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sources ({sources.length})</CardTitle>
          <CardDescription>
            Sources group related documents and support scheduled re-sync
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
            </div>
          ) : sources.length === 0 ? (
            <div className="py-12 text-center">
              <Database className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No sources yet. Create one to organize your knowledge ingestion.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {sources.map((source) => {
                const Icon = sourceTypeIcons[source.source_type] || Database;
                return (
                  <Card key={source.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan/[0.06]">
                            <Icon className="h-5 w-5 text-cyan" />
                          </div>
                          <div>
                            <p className="font-medium">{source.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {source.source_type}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(source)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      {source.description && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          {source.description}
                        </p>
                      )}
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Documents</p>
                          <p className="font-medium">{source.document_count}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Chunks</p>
                          <p className="font-medium">{source.total_chunks}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Status</p>
                          <Badge
                            className={
                              source.is_active
                                ? "border border-success/25 bg-success/10 text-success"
                                : "bg-white/[0.06] text-muted-foreground"
                            }
                          >
                            {source.status}
                          </Badge>
                        </div>
                      </div>
                      {source.last_synced_at && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Last synced: {new Date(source.last_synced_at).toLocaleString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Source</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.name}&quot;? Documents from this source
              will NOT be deleted (they will be orphaned). Set delete_documents=true
              via API to also delete documents.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
