"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Upload,
  Trash2,
  File as FileIcon,
  ImageIcon,
  FileCheck,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { CustomerDocument } from "@/types/customer.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const DOC_TYPE_LABEL: Record<CustomerDocument["type"], string> = {
  invoice: "Invoice",
  certificate: "Certificate",
  warranty: "Warranty",
  prescription: "Prescription",
  id_proof: "ID Proof",
  other: "Other",
};

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  return FileIcon;
}

export function DocumentsTab({
  customerId,
  documents,
}: {
  customerId: string;
  documents: CustomerDocument[];
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/customers/${customerId}/documents/${id}`),
    onSuccess: () => {
      toast.success("Document deleted");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customer });
    },
    onError: (err) =>
      toast.error("Delete failed", { description: getErrorMessage(err) }),
  });

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", file.name);
      form.append("type", "other");
      await api.post(`/customers/${customerId}/documents`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Document uploaded");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customer });
    } catch (err) {
      toast.error("Upload failed", { description: getErrorMessage(err) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">My Documents</CardTitle>
        <Button
          variant="gradient"
          size="sm"
          loading={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          onChange={onUpload}
          accept="image/*,.pdf,.doc,.docx"
        />
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Invoices, warranties, and certificates from your orders will appear here. You can also upload your own."
            action={
              <Button
                variant="gradient"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> Upload document
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {documents.map((doc) => {
              const Icon = fileIcon(doc.mimeType);
              return (
                <div
                  key={doc.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {doc.name}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">
                        {DOC_TYPE_LABEL[doc.type]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(doc.uploadedAt)} ·{" "}
                      {(doc.sizeBytes / 1024).toFixed(0)} KB
                    </p>
                    <div className="mt-2 flex items-center gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={doc.url}
                          download={doc.name}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(doc.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
