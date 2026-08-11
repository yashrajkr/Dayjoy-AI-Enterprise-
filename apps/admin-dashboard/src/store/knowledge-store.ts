"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { KnowledgeDocument } from "@/types/domain";
import { logAudit } from "@/store/audit-store";

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const SEED_DOCS: KnowledgeDocument[] = [
  {
    id: "doc_catalog",
    title: "Dayjoy Product Catalog 2026",
    category: "Products",
    format: "pdf",
    sizeBytes: 4_200_000,
    chunks: 420,
    status: "ready",
    progress: 100,
    uploadedBy: "admin@dayjoy.ai",
    createdAt: "2026-01-04T08:00:00.000Z",
    updatedAt: "2026-01-04T08:12:00.000Z",
    tags: ["catalog", "products", "2026"],
  },
  {
    id: "doc_distributor_policy",
    title: "Distributor Policy Handbook",
    category: "Policy",
    format: "docx",
    sizeBytes: 1_800_000,
    chunks: 260,
    status: "ready",
    progress: 100,
    uploadedBy: "admin@dayjoy.ai",
    createdAt: "2026-01-06T09:30:00.000Z",
    updatedAt: "2026-01-06T09:42:00.000Z",
    tags: ["policy", "distributor"],
  },
  {
    id: "doc_returns",
    title: "Returns & Refunds SOP",
    category: "Support",
    format: "md",
    sizeBytes: 320_000,
    chunks: 180,
    status: "ready",
    progress: 100,
    uploadedBy: "admin@dayjoy.ai",
    createdAt: "2026-01-10T11:00:00.000Z",
    updatedAt: "2026-01-10T11:08:00.000Z",
    tags: ["returns", "sop", "support"],
  },
  {
    id: "doc_voice_playbook",
    title: "Voice Agent Playbook",
    category: "AI",
    format: "pdf",
    sizeBytes: 980_000,
    chunks: 145,
    status: "ready",
    progress: 100,
    uploadedBy: "admin@dayjoy.ai",
    createdAt: "2026-01-15T13:15:00.000Z",
    updatedAt: "2026-01-15T13:24:00.000Z",
    tags: ["voice", "playbook", "ai"],
  },
  {
    id: "doc_ingredient_compliance",
    title: "Ingredient Compliance Sheet",
    category: "Compliance",
    format: "csv",
    sizeBytes: 640_000,
    chunks: 310,
    status: "ready",
    progress: 100,
    uploadedBy: "admin@dayjoy.ai",
    createdAt: "2026-02-02T10:00:00.000Z",
    updatedAt: "2026-02-02T10:11:00.000Z",
    tags: ["compliance", "ingredients"],
  },
  {
    id: "doc_pricing",
    title: "Regional Pricing Matrix",
    category: "Sales",
    format: "csv",
    sizeBytes: 410_000,
    chunks: 205,
    status: "ready",
    progress: 100,
    uploadedBy: "admin@dayjoy.ai",
    createdAt: "2026-02-05T12:00:00.000Z",
    updatedAt: "2026-02-05T12:07:00.000Z",
    tags: ["pricing", "regional", "sales"],
  },
];

interface UploadFile {
  name: string;
  format: KnowledgeDocument["format"];
  sizeBytes: number;
  category: string;
}

interface KnowledgeState {
  documents: KnowledgeDocument[];
  upload: (file: UploadFile) => KnowledgeDocument;
  remove: (id: string) => void;
  reprocess: (id: string) => void;
  tick: (id: string) => void;
}

/** Estimate chunk count from a finished upload based on size. */
function estimateChunks(sizeBytes: number): number {
  return Math.max(40, Math.round(sizeBytes / 8000));
}

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set, get) => ({
      documents: SEED_DOCS,
      upload: (file) => {
        const now = new Date().toISOString();
        const title = file.name.replace(/\.[^.]+$/, "");
        const doc: KnowledgeDocument = {
          id: genId("doc"),
          title,
          category: file.category,
          format: file.format,
          sizeBytes: file.sizeBytes,
          chunks: 0,
          status: "uploading",
          progress: 0,
          uploadedBy: "admin@dayjoy.ai",
          createdAt: now,
          updatedAt: now,
          tags: [],
        };
        set((s) => ({ documents: [doc, ...s.documents] }));
        logAudit({
          action: "INSERT",
          resourceType: "knowledge",
          resourceId: doc.id,
          resourceName: doc.title,
          newValues: {
            title: doc.title,
            format: doc.format,
            sizeBytes: doc.sizeBytes,
            status: doc.status,
          },
        });
        return doc;
      },
      remove: (id) => {
        const old = get().documents.find((d) => d.id === id);
        if (!old) return;
        set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
        logAudit({
          action: "DELETE",
          resourceType: "knowledge",
          resourceId: id,
          resourceName: old.title,
        });
      },
      reprocess: (id) => {
        const old = get().documents.find((d) => d.id === id);
        if (!old) return;
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === id
              ? {
                  ...d,
                  status: "processing",
                  progress: 0,
                  errorMessage: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : d,
          ),
        }));
        logAudit({
          action: "UPDATE",
          resourceType: "knowledge",
          resourceId: id,
          resourceName: old.title,
          oldValues: { status: old.status, progress: old.progress },
          newValues: { status: "processing", progress: 0 },
        });
      },
      tick: (id) => {
        const doc = get().documents.find((d) => d.id === id);
        if (!doc) return;
        // Terminal states — nothing to advance.
        if (doc.status === "ready" || doc.status === "failed") return;
        const nextProgress = Math.min(100, doc.progress + 15);
        const nextStatus: KnowledgeDocument["status"] =
          nextProgress >= 100 ? "ready" : nextProgress > 0 ? "processing" : "uploading";
        const nextChunks =
          nextStatus === "ready" ? estimateChunks(doc.sizeBytes) : doc.chunks;
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === id
              ? {
                  ...d,
                  progress: nextProgress,
                  status: nextStatus,
                  chunks: nextChunks,
                  updatedAt: new Date().toISOString(),
                }
              : d,
          ),
        }));
        if (nextStatus === "ready") {
          logAudit({
            action: "UPDATE",
            resourceType: "knowledge",
            resourceId: id,
            resourceName: doc.title,
            oldValues: { status: doc.status, progress: doc.progress },
            newValues: { status: "ready", progress: 100, chunks: nextChunks },
          });
        }
      },
    }),
    { name: "dayjoy_knowledge" },
  ),
);

/** Serialise all documents to a CSV string suitable for download. */
export function exportCsv(): string {
  const docs = useKnowledgeStore.getState().documents;
  const header = [
    "id",
    "title",
    "category",
    "format",
    "sizeBytes",
    "chunks",
    "status",
    "progress",
    "uploadedBy",
    "createdAt",
    "updatedAt",
    "tags",
  ].join(",");
  const escape = (val: string | number): string => {
    const str = String(val);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const rows = docs.map((d) =>
    [
      d.id,
      escape(d.title),
      d.category,
      d.format,
      d.sizeBytes,
      d.chunks,
      d.status,
      d.progress,
      d.uploadedBy,
      d.createdAt,
      d.updatedAt,
      escape(d.tags.join("|")),
    ].join(","),
  );
  logAudit({
    action: "EXPORT",
    resourceType: "knowledge",
    resourceId: null,
    resourceName: "knowledge-documents",
    metadata: { rowCount: docs.length },
  });
  return [header, ...rows].join("\n");
}
