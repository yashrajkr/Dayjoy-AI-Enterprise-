"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Trash2,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Tag,
  Database,
  History,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  knowledgeApi,
  type KnowledgeDocument,
} from "@/lib/api";

interface ChunkRow {
  id: string;
  chunk_index: number;
  text: string;
  heading_path: string[];
  page: number | null;
  position: number | null;
  char_count: number;
  token_count: number;
  language: string;
  content_sha256: string | null;
  vector_point_id: string | null;
  embedding_model: string | null;
  status: string;
  metadata: Record<string, unknown>;
}

interface VersionRow {
  id: string;
  version: number;
  title: string;
  source_uri: string | null;
  format: string;
  size_bytes: number;
  chunk_count: number;
  content_sha256: string | null;
  is_active: boolean;
  change_summary: string | null;
  created_by: string | null;
  created_at: string | null;
}

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [doc, setDoc] = useState<KnowledgeDocument | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [chunks, setChunks] = useState<ChunkRow[]>([]);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [d, s, c, v] = await Promise.all([
        knowledgeApi.getDocument(id),
        knowledgeApi.getIngestionStatus(id).catch(() => null),
        knowledgeApi.getDocumentChunks(id, { limit: 100 }),
        knowledgeApi.getDocumentVersions(id).catch(() => []),
      ]);
      setDoc(d);
      setStatus(s);
      setChunks(c.chunks as ChunkRow[]);
      setChunksTotal(c.total);
      setVersions(v as VersionRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDelete = async () => {
    try {
      await knowledgeApi.deleteDocument(id);
      setDeleteOpen(false);
      router.push("/knowledge");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleReindex = async () => {
    try {
      setReindexing(true);
      // For URL sources, content is None (re-crawl)
      // For file uploads, would need to re-upload — API supports content parameter
      await knowledgeApi.reindexDocument(id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-index failed");
    } finally {
      setReindexing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error || "Document not found"}
        </div>
        <Link href="/knowledge">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Knowledge Base
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Link
            href="/knowledge"
            className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Knowledge Base
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{doc.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="uppercase">
              {doc.format}
            </Badge>
            <Badge variant="outline">v{doc.version}</Badge>
            {doc.filename && <span>· {doc.filename}</span>}
            {doc.source_uri && (
              <a
                href={doc.source_uri}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center text-cyan hover:underline"
              >
                {doc.source_uri}
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReindex}
            disabled={reindexing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${reindexing ? "animate-spin" : ""}`} />
            {reindexing ? "Re-indexing..." : "Re-index"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
            Delete
          </Button>
        </div>
      </div>

      {/* Status + stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="mt-1">
              <Badge
                className={
                  doc.status === "ready"
                    ? "border border-success/25 bg-success/10 text-success"
                    : doc.status === "failed"
                      ? "border border-destructive/25 bg-destructive/10 text-destructive"
                      : "border border-cyan/25 bg-cyan/10 text-cyan"
                }
              >
                {doc.status === "ready" && <CheckCircle className="mr-1 h-3 w-3" />}
                {doc.status === "failed" && <AlertCircle className="mr-1 h-3 w-3" />}
                {["parsing", "chunking", "embedding", "indexing"].includes(doc.status) && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                {doc.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Chunks</p>
            <p className="mt-1 text-xl font-bold">{doc.chunk_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Characters</p>
            <p className="mt-1 text-xl font-bold">{doc.char_count.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Tokens (~)</p>
            <p className="mt-1 text-xl font-bold">{doc.token_count.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Size</p>
            <p className="mt-1 text-xl font-bold">
              {(doc.size_bytes / 1024).toFixed(1)} KB
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Language</p>
            <p className="mt-1 text-xl font-bold uppercase">{doc.language}</p>
          </CardContent>
        </Card>
      </div>

      {doc.error_message && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <div>
            <strong>Ingestion error:</strong> {doc.error_message}
            {doc.retry_count > 0 && (
              <p className="mt-1 text-xs text-destructive">
                Retries: {doc.retry_count}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="chunks">
        <TabsList>
          <TabsTrigger value="chunks">
            <Layers className="mr-2 h-4 w-4" />
            Chunks ({chunks.length})
          </TabsTrigger>
          <TabsTrigger value="versions">
            <History className="mr-2 h-4 w-4" />
            Versions ({versions.length})
          </TabsTrigger>
          <TabsTrigger value="status">
            <Clock className="mr-2 h-4 w-4" />
            Processing Status
          </TabsTrigger>
          <TabsTrigger value="metadata">
            <Database className="mr-2 h-4 w-4" />
            Metadata
          </TabsTrigger>
        </TabsList>

        {/* Chunks */}
        <TabsContent value="chunks">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Document Chunks</CardTitle>
              <CardDescription>
                {chunks.length} of {chunksTotal} chunks shown. Each chunk maps to one point in the vector DB.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {chunks.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No chunks yet. Document may still be processing.
                </p>
              ) : (
                chunks.map((chunk) => (
                  <div key={chunk.id} className="rounded-lg border border-white/[0.06] p-4">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">#{chunk.chunk_index}</Badge>
                        {chunk.page && (
                          <Badge variant="outline">Page {chunk.page}</Badge>
                        )}
                        <Badge variant="outline">{chunk.language}</Badge>
                        <span className="text-muted-foreground">
                          {chunk.token_count} tokens · {chunk.char_count} chars
                        </span>
                      </div>
                      <code className="text-xs text-muted-foreground/70">
                        {chunk.vector_point_id?.slice(0, 8)}...
                      </code>
                    </div>
                    {chunk.heading_path && chunk.heading_path.length > 0 && (
                      <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Tag className="h-3 w-3" />
                        {chunk.heading_path.join(" › ")}
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap text-foreground">
                      {chunk.text}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Versions */}
        <TabsContent value="versions">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Version History</CardTitle>
              <CardDescription>
                All versions of this document (latest is currently indexed)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No version history yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={v.is_active ? "default" : "outline"}>
                          v{v.version}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">{v.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.chunk_count} chunks · {(v.size_bytes / 1024).toFixed(1)} KB ·{" "}
                            {v.format}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {v.created_at && new Date(v.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Processing Status */}
        <TabsContent value="status">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ingestion Job Status</CardTitle>
              <CardDescription>
                Live status of the background ingestion pipeline
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="text-sm font-medium">
                        {String(status.status || "—")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Progress</p>
                      <p className="text-sm font-medium">
                        {String(status.progress || 0)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Current Step</p>
                      <p className="text-sm font-medium">
                        {String(status.current_step || "—")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-sm font-medium">
                        {status.duration_ms ? `${status.duration_ms}ms` : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Chunks Created</p>
                      <p className="text-sm font-medium">
                        {String(status.chunks_created || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Embeddings Generated</p>
                      <p className="text-sm font-medium">
                        {String(status.embeddings_generated || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vectors Upserted</p>
                      <p className="text-sm font-medium">
                        {String(status.vectors_upserted || 0)}
                      </p>
                    </div>
                  </div>
                  {status.error_message && (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                      {String(status.error_message)}
                    </div>
                  )}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No ingestion job info available.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metadata */}
        <TabsContent value="metadata">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Document Metadata</CardTitle>
              <CardDescription>
                Category, tags, custom metadata, embedding info
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="text-sm font-medium">{doc.category || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Language</p>
                  <p className="text-sm font-medium uppercase">{doc.language}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Embedding Model</p>
                  <p className="text-sm font-medium">
                    {doc.embedding_model || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Page Count</p>
                  <p className="text-sm font-medium">{doc.page_count || "—"}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {doc.tags.length > 0 ? (
                    doc.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        <Tag className="mr-1 h-3 w-3" />
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground/70">No tags</span>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Custom Metadata (JSON)</p>
                <pre className="overflow-auto rounded-md bg-white/[0.03] p-4 text-xs whitespace-pre-wrap">
                  {JSON.stringify(doc.metadata, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              This will soft-delete &quot;{doc.title}&quot; and remove all {doc.chunk_count} chunks
              and vectors from the vector DB. The row is retained for audit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
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
