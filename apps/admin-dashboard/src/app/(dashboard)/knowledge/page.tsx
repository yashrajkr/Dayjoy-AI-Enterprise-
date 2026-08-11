"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  FileText,
  Upload,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Tag,
  Database,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  knowledgeApi,
  type KnowledgeDocument,
  type RAGAnalytics,
} from "@/lib/api";

const statusColors: Record<string, string> = {
  ready: "border border-success/25 bg-success/10 text-success",
  pending: "border border-warning/25 bg-warning/10 text-warning",
  parsing: "border border-cyan/25 bg-cyan/10 text-cyan",
  chunking: "border border-cyan/25 bg-cyan/10 text-cyan",
  embedding: "border border-cyan/25 bg-cyan/10 text-cyan",
  indexing: "border border-cyan/25 bg-cyan/10 text-cyan",
  failed: "border border-destructive/25 bg-destructive/10 text-destructive",
  deleted: "border border-white/10 bg-white/[0.06] text-muted-foreground",
};

const formatIcons: Record<string, string> = {
  pdf: "📄",
  docx: "📝",
  txt: "📃",
  md: "📋",
  csv: "📊",
  json: "🔧",
  html: "🌐",
  web: "🌐",
  faq: "❓",
};

export default function KnowledgeLibraryPage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [formatFilter, setFormatFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [analytics, setAnalytics] = useState<RAGAnalytics | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualTags, setManualTags] = useState("");
  const [creating, setCreating] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: { status?: string; format?: string; limit?: number; offset?: number } = { limit: 50, offset: 0 };
      if (statusFilter) params.status = statusFilter;
      if (formatFilter) params.format = formatFilter;
      const res = await knowledgeApi.listDocuments(params);
      setDocuments(res.documents);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, formatFilter]);

  const loadAnalytics = useCallback(async () => {
    try {
      const a = await knowledgeApi.getAnalytics();
      setAnalytics(a);
    } catch (err) {
      // Silently fail — analytics is non-critical
      console.error("Failed to load analytics", err);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
    void loadAnalytics();
  }, [loadDocuments, loadAnalytics]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await knowledgeApi.deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
      await loadDocuments();
      await loadAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleManualSubmit = async () => {
    if (!manualTitle.trim() || !manualContent.trim()) return;
    try {
      setCreating(true);
      await knowledgeApi.createManualEntry({
        title: manualTitle,
        content: manualContent,
        category: manualCategory || undefined,
        tags: manualTags
          ? manualTags.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined,
      });
      setManualOpen(false);
      setManualTitle("");
      setManualContent("");
      setManualCategory("");
      setManualTags("");
      await loadDocuments();
      await loadAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entry");
    } finally {
      setCreating(false);
    }
  };

  const filteredDocs = searchQuery
    ? documents.filter(
        (d) =>
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.category?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : documents;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">
            Upload, manage, and search your tenant&apos;s knowledge — RAG-powered
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Manual Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Manual Knowledge Entry</DialogTitle>
                <DialogDescription>
                  Type knowledge directly. It will be chunked, embedded, and
                  indexed like any uploaded document.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="e.g. Business Hours Policy"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    placeholder="Type the knowledge content here..."
                    className="min-h-[200px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category (optional)</Label>
                    <Input
                      id="category"
                      value={manualCategory}
                      onChange={(e) => setManualCategory(e.target.value)}
                      placeholder="e.g. policy"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tags">Tags (comma-separated)</Label>
                    <Input
                      id="tags"
                      value={manualTags}
                      onChange={(e) => setManualTags(e.target.value)}
                      placeholder="hours, policy"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setManualOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleManualSubmit}
                  disabled={creating || !manualTitle.trim() || !manualContent.trim()}
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Entry"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Link href="/knowledge/upload">
            <Button size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </Link>
          <Link href="/knowledge/search">
            <Button variant="outline" size="sm">
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </Link>
          <Link href="/knowledge/sources">
            <Button variant="outline" size="sm">
              <Database className="mr-2 h-4 w-4" />
              Sources
            </Button>
          </Link>
        </div>
      </div>

      {/* Analytics summary */}
      {analytics && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Documents
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Object.values(analytics.documents).reduce((a, b) => a + b, 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {analytics.documents.ready || 0} ready ·{" "}
                {analytics.documents.failed || 0} failed
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Indexed Chunks
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.total_chunks}</div>
              <p className="text-xs text-muted-foreground">Vector DB indexed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Searches (30d)
              </CardTitle>
              <Search className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.searches_30d.total}
              </div>
              <p className="text-xs text-muted-foreground">
                {analytics.searches_30d.successful} successful ·{" "}
                {(analytics.searches_30d.success_rate * 100).toFixed(1)}% rate
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Confidence
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground/70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(analytics.searches_30d.avg_confidence * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Avg latency: {analytics.searches_30d.avg_latency_ms.toFixed(0)}ms
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by title, filename, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-10 w-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="ready">Ready</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="deleted">Deleted</option>
            </select>
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              className="flex h-10 w-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All formats</option>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="txt">TXT</option>
              <option value="md">Markdown</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="html">HTML</option>
              <option value="web">Web</option>
              <option value="faq">FAQ</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => void loadDocuments()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Documents table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Documents ({filteredDocs.length} of {total})
          </CardTitle>
          <CardDescription>
            Click a document to view chunks, versions, and ingestion details
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-12 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No documents found. Upload one to get started.
              </p>
              <Link href="/knowledge/upload">
                <Button className="mt-4" size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Format</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Chunks</th>
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 pr-4 font-medium">Version</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 pr-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc) => (
                    <tr key={doc.id} className="border-b last:border-0 hover:border-white/[0.14] hover:bg-white/[0.04]">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/knowledge/${doc.id}`}
                          className="flex items-center gap-2 font-medium text-cyan hover:underline"
                        >
                          <span>{formatIcons[doc.format] || "📄"}</span>
                          <span className="truncate">{doc.title}</span>
                        </Link>
                        {doc.filename && (
                          <p className="text-xs text-muted-foreground">{doc.filename}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="uppercase">
                          {doc.format}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          className={statusColors[doc.status] || "border border-white/10 bg-white/[0.06] text-muted-foreground"}
                        >
                          {doc.status === "ready" && <CheckCircle className="mr-1 h-3 w-3" />}
                          {doc.status === "failed" && <AlertCircle className="mr-1 h-3 w-3" />}
                          {["parsing", "chunking", "embedding", "indexing"].includes(
                            doc.status,
                          ) && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {doc.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{doc.chunk_count}</td>
                      <td className="py-3 pr-4">
                        {doc.category ? (
                          <Badge variant="secondary">{doc.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground/70">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">v{doc.version}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(doc.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex gap-1">
                          <Link href={`/knowledge/${doc.id}`}>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(doc)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags summary */}
      {documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tags in Use</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Array.from(
                new Set(documents.flatMap((d) => d.tags || [])),
              ).map((tag) => (
                <Badge key={tag} variant="secondary">
                  <Tag className="mr-1 h-3 w-3" />
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.title}&quot;?
              This will remove all chunks and vectors. The document row will be
              soft-deleted (recoverable from DB).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
