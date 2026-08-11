"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  FileText,
  FolderOpen,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { documentsService } from "@/lib/services";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
} from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

const FILE_TYPE_COLOR: Record<string, string> = {
  PDF: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  XLSX: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  DOCX: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  IMAGE: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  ZIP: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<string>("OTHER");

  const { data: documents, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["documents", { category: categoryFilter }],
    queryFn: () =>
      documentsService.list({
        category: categoryFilter !== "all" ? categoryFilter : undefined,
      }),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => documentsService.upload(file, uploadCategory),
    onSuccess: () => {
      toast.success("Document uploaded successfully.");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setUploadOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: () => toast.error("Failed to upload document."),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Invoices, commission statements, tax documents, certificates, and agreements."
        icon={FolderOpen}
        actions={
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload document</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Category
                  </label>
                  <Select value={uploadCategory} onValueChange={setUploadCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {DOCUMENT_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    File
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground hover:file:bg-primary/90"
                    accept=".pdf,.xlsx,.docx,.png,.jpg,.zip"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    const file = fileInputRef.current?.files?.[0];
                    if (!file) {
                      toast.error("Select a file first.");
                      return;
                    }
                    uploadMutation.mutate(file);
                  }}
                  loading={uploadMutation.isPending}
                >
                  Upload document
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-4">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[220px]" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {DOCUMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isError && (
        <InlineAlert variant="error">
          Failed to load documents: {(error as Error)?.message ?? "Unknown error"}.{" "}
          <button
            type="button"
            onClick={() => refetch()}
            className="underline underline-offset-2"
          >
            Retry
          </button>
        </InlineAlert>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="m-3 h-14" />
            ))}
          </CardContent>
        </Card>
      ) : !documents || documents.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No documents found"
          description="Try adjusting your filter or upload a new document."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3 font-medium">Uploaded</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium text-foreground">
                            {doc.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">
                          {DOCUMENT_CATEGORY_LABELS[doc.category]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={cn(
                            "border-transparent",
                            FILE_TYPE_COLOR[doc.type] ??
                              "bg-muted text-muted-foreground",
                          )}
                        >
                          {doc.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatBytes(doc.size)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(doc.uploadedAt)}
                        <div className="text-[10px]">by {doc.uploadedBy}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            download
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
