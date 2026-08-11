"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Loader2,
  AlertCircle,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useKnowledgeArticle } from "@/hooks/use-api";
import { formatRelativeTime, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Knowledge Article Detail — full content view, rendered from the
 * article's markdown `content`. Includes a feedback row ("Was this
 * helpful?") and a "Related articles" placeholder.
 */
export default function KnowledgeArticlePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? null;

  // The hook expects an id; the API also accepts slug lookups.
  const { data: article, isLoading, isError } = useKnowledgeArticle(slug);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const handleFeedback = (kind: "up" | "down") => {
    setFeedback(kind);
    toast.success("Thanks for your feedback!");
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Article" description="Loading…" icon={BookOpen} />
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading article…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={AlertCircle}
          title="Article not found"
          description="This article may have been moved or deleted."
          action={
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/support/knowledge-base">
                  Back to knowledge base
                </Link>
              </Button>
              <Button variant="outline" onClick={() => router.back()}>
                Go back
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={article.title}
        description={article.excerpt}
        icon={BookOpen}
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href="/support/knowledge-base">
              <ArrowLeft className="h-4 w-4" />
              All articles
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Badge variant="muted">{article.category}</Badge>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {article.readingMinutes ?? 3} min read
        </span>
        <span>·</span>
        <span>Updated {formatRelativeTime(article.updatedAt)}</span>
        <span>·</span>
        <span>Published {formatDateTime(article.updatedAt)}</span>
      </div>

      {article.tags && article.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {article.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              #{tag}
            </Badge>
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-6">
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {article.content}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      {/* Feedback */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Was this article helpful?</CardTitle>
          <CardDescription className="text-xs">
            Your feedback helps us improve our knowledge base.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Button
            variant={feedback === "up" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => handleFeedback("up")}
            disabled={feedback !== null}
          >
            <ThumbsUp className="h-4 w-4" />
            Yes
          </Button>
          <Button
            variant={feedback === "down" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => handleFeedback("down")}
            disabled={feedback !== null}
          >
            <ThumbsDown className="h-4 w-4" />
            No
          </Button>
          {feedback ? (
            <span className="text-xs text-muted-foreground">
              Thanks for your feedback!
            </span>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Need more help?</p>
            <p className="text-xs text-muted-foreground">
              <Link
                href="/ai-assistant"
                className="font-medium text-primary hover:underline"
              >
                Ask the AI Assistant
              </Link>{" "}
              or{" "}
              <Link
                href="/support/tickets/new"
                className="font-medium text-primary hover:underline"
              >
                open a support ticket
              </Link>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
