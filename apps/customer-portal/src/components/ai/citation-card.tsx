"use client";

import { ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import type { Citation } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CitationCardProps {
  citation: Citation;
  index?: number;
  className?: string;
}

/**
 * Citation card — shows the source document a RAG-grounded AI response
 * was drawn from. Renders the document title, the matched snippet, and
 * a "Read more" link when the citation carries a URL.
 */
export function CitationCard({
  citation,
  index,
  className,
}: CitationCardProps) {
  return (
    <Card
      className={cn(
        "border-l-4 border-l-primary/60 bg-card/60",
        className,
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {typeof index === "number" ? (
                <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                  {index + 1}
                </Badge>
              ) : null}
              <p className="truncate text-sm font-medium text-foreground">
                {citation.documentTitle}
              </p>
            </div>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {citation.snippet}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {citation.source ? (
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {citation.source}
                  </span>
                ) : null}
                {typeof citation.score === "number" ? (
                  <span>
                    Match: {Math.round((citation.score ?? 0) * 100)}%
                  </span>
                ) : null}
              </div>
              {citation.url ? (
                <Link
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Read more
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
