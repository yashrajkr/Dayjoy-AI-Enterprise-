"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Upload, Download, Trash2, RefreshCw, FileText, Filter, X } from "lucide-react";
import { toast } from "sonner";
import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Cell, DataTable, Meter, PageHeader, Pill, Row } from "@/components/kit/page-header";
import { KpiCard } from "@/components/kit/kpi-card";
import { StatusBadge } from "@/components/kit/status-badge";
import { FormDialog } from "@/components/kit/form-dialog";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Field } from "@/components/kit/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKnowledgeStore } from "@/store/knowledge-store";
import { usePermissions } from "@/hooks/use-permissions";
import type { KnowledgeDocument } from "@/types/domain";

type DateRange = "all" | "7d" | "30d" | "90d";

const FORMAT_TONES: Record<string, "brand" | "info" | "success" | "violet" | "warning" | "muted"> = {
  pdf: "danger",
  docx: "info",
  md: "success",
  txt: "muted",
  html: "warning",
  csv: "violet",
};

export function KnowledgeView() {
  const docs = useKnowledgeStore((s) => s.documents);
  const upload = useKnowledgeStore((s) => s.upload);
  const remove = useKnowledgeStore((s) => s.remove);
  const reprocess = useKnowledgeStore((s) => s.reprocess);
  const tick = useKnowledgeStore((s) => s.tick);
  const exportCsv = useKnowledgeStore((s) => s.exportCsv);
  const { can } = usePermissions();

  const [query, setQuery] = useState("");
  const [range, setRange] = useState<DateRange>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(null);
  const [viewTarget, setViewTarget] = useState<KnowledgeDocument | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick the store every 800ms to advance uploading/processing docs toward ready
  useEffect(() => {
    const hasPending = docs.some((d) => d.status === "uploading" || d.status === "processing");
    if (hasPending && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        const stillPending = useKnowledgeStore
          .getState()
          .documents.some((d) => d.status === "uploading" || d.status === "processing");
        if (!stillPending && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        } else {
          useKnowledgeStore.getState().documents.forEach((d) => {
            if (d.status === "uploading" || d.status === "processing") tick(d.id);
          });
        }
      }, 800);
    }
    return () => {
      if (intervalRef.current && !hasPending) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [docs, tick]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      range === "7d" ? now - 7 * 86400_000
      : range === "30d" ? now - 30 * 86400_000
      : range === "90d" ? now - 90 * 86400_000
      : 0;
    return docs.filter((d) => {
      if (cutoff && new Date(d.createdAt).getTime() < cutoff) return false;
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (!d.title.toLowerCase().includes(q) && !d.category.toLowerCase().includes(q) && !d.tags.some((t) => t.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [docs, query, range, categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set(docs.map((d) => d.category));
    return ["all", ...Array.from(set).sort()];
  }, [docs]);

  const kpis = useMemo(() => {
    const total = docs.length;
    const chunks = docs.reduce((s, d) => s + d.chunks, 0);
    const ready = docs.filter((d) => d.status === "ready").length;
    const processing = docs.filter((d) => d.status === "uploading" || d.status === "processing").length;
    return [
      { label: "Total Documents", value: total, change: `+${processing}`, icon: "docs" as const, tone: "brand" as const, spark: [110, 120, 128, 136, 144, 152, total] },
      { label: "Total Chunks", value: chunks, change: "+4.1%", icon: "chunks" as const, tone: "info" as const, spark: [2100, 2280, 2400, 2520, 2650, 2740, chunks] },
      { label: "Ready", value: ready, change: `${total - ready} pending`, icon: "query" as const, tone: "success" as const, spark: [80, 90, 100, 110, 120, 130, ready] },
      { label: "Processing", value: processing, change: "live", icon: "latency" as const, tone: "violet" as const, spark: [0, 1, 2, 1, 3, 2, processing] },
    ];
  }, [docs]);

  const handleExport = () => {
    if (!can("knowledge", "export")) {
      toast.error("Permission denied", { description: "You do not have export permission for knowledge." });
      return;
    }
    const csv = exportCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dayjoy-knowledge-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Export complete", { description: `${docs.length} documents exported to CSV.` });
  };

  const handleSearch = () => {
    if (!query.trim()) {
      toast.warning("Empty query", { description: "Type a keyword or select a filter." });
      return;
    }
    toast.success("Search applied", { description: `${filtered.length} document(s) match "${query}".` });
  };

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        subtitle="Grounding sources powering every AI answer. Upload, manage, and reprocess documents."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!can("knowledge", "export")}
              className="border-border bg-glass"
            >
              <Download className="mr-1.5 size-4" /> Export
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!can("knowledge", "create")) {
                  toast.error("Permission denied", { description: "You do not have upload permission." });
                  return;
                }
                setUploadOpen(true);
              }}
              className="bg-gradient-brand"
            >
              <Upload className="mr-1.5 size-4" /> Upload Document
            </Button>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} delay={i * 0.05} />
        ))}
      </section>

      <GlassCard delay={0.15} tilt={false} className="p-4">
        <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto_auto]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="Search by title, category, or tag..."
              className="h-10 border-border bg-glass pl-9"
            />
          </label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-10 w-[160px] border-border bg-glass">
              <Filter className="mr-1.5 size-3.5" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
            <SelectTrigger className="h-10 w-[150px] border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-10 border-border bg-glass"
            onClick={() => { setQuery(""); setRange("all"); setCategoryFilter("all"); }}
          >
            <X className="mr-1.5 size-3.5" /> Clear
          </Button>
        </div>
        {(query || range !== "all" || categoryFilter !== "all") && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Showing <strong className="text-foreground">{filtered.length}</strong> of {docs.length} documents
          </p>
        )}
      </GlassCard>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents found"
          description={docs.length === 0 ? "Upload your first document to build the knowledge base." : "Try adjusting your search or filters."}
          action={docs.length === 0 && can("knowledge", "create") ? { label: "Upload Document", onClick: () => setUploadOpen(true) } : undefined}
        />
      ) : (
        <GlassCard delay={0.2} tilt={false} className="p-5">
          <CardHead title="Documents" subtitle={`${filtered.length} indexed sources`} />
          <DataTable head={["Title", "Category", "Format", "Chunks", "Status", "Uploaded", ""]}>
            {filtered.map((d) => (
              <Row key={d.id}>
                <Cell className="min-w-0">
                  <button
                    onClick={() => setViewTarget(d)}
                    className="block max-w-[280px] truncate text-left font-medium text-brand hover:underline"
                  >
                    {d.title}
                  </button>
                  <span className="block text-[11px] text-muted-foreground">{(d.sizeBytes / 1024).toFixed(1)} KB</span>
                </Cell>
                <Cell><Pill tone="info">{d.category}</Pill></Cell>
                <Cell><Pill tone={FORMAT_TONES[d.format] ?? "muted"}>{d.format.toUpperCase()}</Pill></Cell>
                <Cell className="num">{d.chunks}</Cell>
                <Cell>
                  {d.status === "uploading" || d.status === "processing" ? (
                    <div className="flex w-32 items-center gap-2">
                      <Meter value={d.progress} tone="brand" className="flex-1" />
                      <span className="num text-[10px] text-muted-foreground">{d.progress}%</span>
                    </div>
                  ) : (
                    <StatusBadge status={d.status} />
                  )}
                </Cell>
                <Cell className="num text-[11px] text-muted-foreground">
                  {new Date(d.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </Cell>
                <Cell>
                  <div className="flex items-center gap-1">
                    {(d.status === "failed" || d.status === "ready") && can("knowledge", "edit") ? (
                      <button
                        onClick={() => {
                          reprocess(d.id);
                          toast.info("Reprocessing started", { description: d.title });
                        }}
                        aria-label="Reprocess"
                        className="grid size-8 place-items-center rounded-lg border border-border bg-glass text-subtle transition-colors hover:text-brand"
                      >
                        <RefreshCw className="size-3.5" />
                      </button>
                    ) : null}
                    {can("knowledge", "delete") ? (
                      <button
                        onClick={() => setDeleteTarget(d)}
                        aria-label="Delete"
                        className="grid size-8 place-items-center rounded-lg border border-border bg-glass text-subtle transition-colors hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </Cell>
              </Row>
            ))}
          </DataTable>
        </GlassCard>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={(data) => {
          upload(data);
          toast.success("Upload started", { description: `${data.name} (${data.format.toUpperCase()}) is being processed.` });
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete document?"
        description={`This will permanently remove "${deleteTarget?.title}" and its ${deleteTarget?.chunks ?? 0} chunks from the knowledge base. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          remove(deleteTarget.id);
          toast.success("Document deleted", { description: deleteTarget.title });
        }}
      />

      <FormDialog
        open={!!viewTarget}
        onOpenChange={(open) => !open && setViewTarget(null)}
        title={viewTarget?.title ?? ""}
        description="Document details"
        submitLabel="Close"
        cancelLabel=""
        size="lg"
        onSubmit={() => {}}
      >
        {viewTarget ? (
          <div className="space-y-3 text-[13px]">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-muted-foreground">Category:</span> <strong>{viewTarget.category}</strong></div>
              <div><span className="text-muted-foreground">Format:</span> <strong>{viewTarget.format.toUpperCase()}</strong></div>
              <div><span className="text-muted-foreground">Size:</span> <strong>{(viewTarget.sizeBytes / 1024).toFixed(1)} KB</strong></div>
              <div><span className="text-muted-foreground">Chunks:</span> <strong className="num">{viewTarget.chunks}</strong></div>
              <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={viewTarget.status} /></div>
              <div><span className="text-muted-foreground">Uploaded by:</span> <strong>{viewTarget.uploadedBy}</strong></div>
              <div><span className="text-muted-foreground">Created:</span> <strong>{new Date(viewTarget.createdAt).toLocaleString("en-IN")}</strong></div>
              <div><span className="text-muted-foreground">Updated:</span> <strong>{new Date(viewTarget.updatedAt).toLocaleString("en-IN")}</strong></div>
            </div>
            {viewTarget.tags.length > 0 ? (
              <div>
                <p className="mb-1 text-muted-foreground">Tags:</p>
                <div className="flex flex-wrap gap-1">
                  {viewTarget.tags.map((t) => <Pill key={t} tone="muted">{t}</Pill>)}
                </div>
              </div>
            ) : null}
            {viewTarget.errorMessage ? (
              <div className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-danger">
                <strong>Error:</strong> {viewTarget.errorMessage}
              </div>
            ) : null}
          </div>
        ) : null}
      </FormDialog>
    </>
  );
}

// ===== Upload dialog (separate component for clarity) =====
function UploadDialog({
  open,
  onOpenChange,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (data: { name: string; format: KnowledgeDocument["format"]; sizeBytes: number; category: string }) => void;
}) {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<KnowledgeDocument["format"]>("pdf");
  const [category, setCategory] = useState("Products");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = () => {
    if (!name.trim()) throw new Error("Document title is required");
    if (!category.trim()) throw new Error("Category is required");
    const sizeBytes = file?.size ?? Math.floor(50_000 + Math.random() * 200_000);
    onUpload({ name: name.trim(), format, sizeBytes, category: category.trim() });
    setName(""); setTags(""); setFile(null); setFormat("pdf"); setCategory("Products");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (["pdf", "docx", "md", "txt", "html", "csv"].includes(ext)) {
      setFormat(ext as KnowledgeDocument["format"]);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload Document"
      description="Supported formats: PDF, DOCX, MD, TXT, HTML, CSV. Files are chunked and embedded automatically."
      onSubmit={handleSubmit}
      submitLabel="Upload & Process"
      size="md"
    >
      <Field label="File" hint="Click to select or drag a file into the input.">
        <Input
          type="file"
          accept=".pdf,.docx,.md,.txt,.html,.csv"
          onChange={handleFileChange}
          className="h-10 cursor-pointer border-border bg-glass file:mr-3 file:rounded-md file:border-0 file:bg-brand/12 file:px-3 file:py-1.5 file:text-brand"
        />
      </Field>
      <Field label="Document title" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Q4 Product Catalog Addendum"
          className="h-10 border-border bg-glass"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" required>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-10 border-border bg-glass"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Products", "Policy", "Support", "AI", "Compliance", "Sales"].map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Format override" hint="Auto-detected from file extension.">
          <Select value={format} onValueChange={(v) => setFormat(v as KnowledgeDocument["format"])}>
            <SelectTrigger className="h-10 border-border bg-glass"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["pdf", "docx", "md", "txt", "html", "csv"].map((f) => (
                <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Tags" hint="Comma-separated keywords for search.">
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="returns, refund, policy"
          className="h-10 border-border bg-glass"
        />
      </Field>
    </FormDialog>
  );
}
