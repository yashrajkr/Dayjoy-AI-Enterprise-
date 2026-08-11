"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marked } from "marked";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Eye,
  HelpCircle,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { knowledgeService } from "@/lib/services";
import { KNOWLEDGE_CATEGORY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export default function KnowledgeArticlePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [feedbackGiven, setFeedbackGiven] = useState<"up" | "down" | null>(null);

  const { data: article, isLoading, isError, error } = useQuery({
    queryKey: ["knowledge-article", params.slug],
    queryFn: () => knowledgeService.get(params.slug),
    enabled: !!params.slug,
  });

  const feedbackMutation = useMutation({
    mutationFn: (helpful: boolean) =>
      knowledgeService.feedback(article!.id, helpful),
    onSuccess: (_, helpful) => {
      setFeedbackGiven(helpful ? "up" : "down");
      toast.success("Thanks for your feedback!");
      queryClient.invalidateQueries({
        queryKey: ["knowledge-article", params.slug],
      });
    },
    onError: () => toast.error("Failed to record feedback."),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <InlineAlert variant="error">
        Failed to load article: {(error as Error)?.message ?? "Not found"}.{" "}
        <button
          type="button"
          onClick={() => router.push("/knowledge")}
          className="underline"
        >
          Back to knowledge base
        </button>
      </InlineAlert>
    );
  }

  const html = marked.parse(article.content, { async: false }) as string;
  const related = article.relatedIds
    .map(() => null) // Real impl would fetch by IDs
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        title={article.title}
        description={article.summary}
        icon={BookOpen}
        breadcrumbs={[
          { label: "Knowledge Base", href: "/knowledge" },
          { label: article.title },
        ]}
        actions={
          <Button variant="outline" onClick={() => router.push("/knowledge")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main article */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">
                  {KNOWLEDGE_CATEGORY_LABELS[article.category]}
                </Badge>
                <span>By {article.author}</span>
                <span>·</span>
                <span>Updated {formatDate(article.updatedAt)}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {article.views} views
                </span>
                <span>·</span>
                <span>{article.readTime} min read</span>
              </div>

              {article.tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1">
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <article
                className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-foreground prose-pre:rounded-lg prose-pre:border prose-pre:border-border"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </CardContent>
          </Card>

          {/* Feedback */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <div className="text-center sm:text-left">
                  <p className="flex items-center gap-1.5 font-medium text-foreground">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    Was this article helpful?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {article.helpful} found this helpful · {article.notHelpful}{" "}
                    did not
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={feedbackGiven === "up" ? "default" : "outline"}
                    size="sm"
                    onClick={() => feedbackMutation.mutate(true)}
                    disabled={feedbackGiven !== null || feedbackMutation.isPending}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    Yes
                  </Button>
                  <Button
                    variant={feedbackGiven === "down" ? "default" : "outline"}
                    size="sm"
                    onClick={() => feedbackMutation.mutate(false)}
                    disabled={feedbackGiven !== null || feedbackMutation.isPending}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    No
                  </Button>
                </div>
              </div>
              {feedbackGiven && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Thank you! Your feedback helps us improve.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar — ask AI + related */}
        <div className="space-y-6">
          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Ask AI about this
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Have a follow-up question? Ask the AI assistant — it has read
                this article and can clarify anything.
              </p>
              <Button
                className="mt-3 w-full"
                asChild
              >
                <Link
                  href={`/ai-assistant?prompt=${encodeURIComponent(
                    `I just read "${article.title}" in the knowledge base. Can you summarize the key points?`,
                  )}`}
                >
                  <Sparkles className="h-4 w-4" />
                  Ask AI
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Related articles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {article.relatedIds.length > 0 ? (
                article.relatedIds.map((rid) => (
                  <Link
                    key={rid}
                    href="#"
                    className="flex items-center justify-between rounded-lg border border-border p-3 text-sm transition-colors hover:bg-accent/30"
                  >
                    <span>Related article</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                ))
              ) : (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No related articles.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
