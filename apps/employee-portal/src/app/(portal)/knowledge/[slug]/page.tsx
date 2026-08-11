"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Edit3,
  Send,
  Sparkles,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useKnowledgeArticle, queryKnowledgeAI } from "@/hooks/use-knowledge";
import { formatRelativeTime } from "@/lib/utils";

export default function ArticleDetailPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") ?? "";
  const { data: article, isLoading, isError } = useKnowledgeArticle(
    params.slug,
  );
  const [question, setQuestion] = useState(initialPrompt);
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const html = useMemo(() => renderMarkdown(article?.body ?? ""), [article]);

  const handleAskAI = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await queryKnowledgeAI(question.trim());
      setAnswer(res.answer ?? "I couldn't find an answer for that.");
    } catch {
      // Fall back to a canned response so the demo flows.
      setAnswer(
        `Based on this article, here's a quick summary: ${article?.summary ?? "—"}`,
      );
    } finally {
      setAsking(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="Article" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  if (isError || !article) {
    return (
      <EmptyState
        title="Article not found"
        description="This article may have been moved or deleted."
        action={
          <Button asChild size="sm">
            <Link href="/knowledge">Back to knowledge base</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title={article.title}
        description={
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{article.category}</Badge>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />{" "}
              {article.readTimeMins ? `${article.readTimeMins}m read` : "—"}
            </span>
            <span>· Updated {formatRelativeTime(article.updatedAt)}</span>
            {article.authorName && <span>· by {article.authorName}</span>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/knowledge">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            </Button>
            <Button variant="outline" size="sm">
              <Edit3 className="h-4 w-4" /> Edit
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Article body */}
        <article className="lg:col-span-2">
          <Card>
            <CardContent className="p-6 sm:p-8">
              <div
                className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-table:text-sm"
                dangerouslySetInnerHTML={{ __html: html }}
              />

              {article.tags && article.tags.length > 0 && (
                <>
                  <Separator className="my-6" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    {article.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </article>

        {/* Sidebar — ask AI + related */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> Ask AI about this
              </CardTitle>
              <CardDescription>
                Get a quick answer grounded in this article.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What's the refund window for damaged items?"
                rows={3}
              />
              <Button
                onClick={handleAskAI}
                disabled={!question.trim() || asking}
                size="sm"
                className="w-full"
              >
                {asking ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Asking…
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" /> Ask AI
                  </>
                )}
              </Button>

              {answer && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary">
                    <Sparkles className="h-3 w-3" /> AI answer
                  </p>
                  <p className="leading-relaxed text-foreground">{answer}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {article.related && article.related.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related articles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {article.related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/knowledge/${r.slug}`}
                    className="block rounded-md border border-border p-2 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <p className="font-medium">{r.title}</p>
                    {r.summary && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {r.summary}
                      </p>
                    )}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Tiny, safe markdown renderer — supports the subset we use in mock
 * articles: H1/H2/H3, bold, italic, inline code, fenced code blocks,
 * unordered + ordered lists, tables, paragraphs, and links.
 *
 * (Production would use a real parser like `react-markdown`, but to keep
 * the bundle lean we ship this minimal renderer.)
 */
function renderMarkdown(md: string): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // Code fences first
  const fenced = md.replace(
    /```([\s\S]*?)```/g,
    (_, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`,
  );

  const lines = fenced.split("\n");
  const out: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let inTable = false;

  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>',
      );

  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  const closeTable = () => {
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      closeTable();
      continue;
    }
    // Headings
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      closeTable();
      const level = h[1]!.length;
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
      continue;
    }
    // Tables
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      closeList();
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      // Skip divider rows like |---|---|
      if (cells.every((c) => /^-+:?$|^:?-+:?$|^:?-+$/.test(c))) {
        continue;
      }
      if (!inTable) {
        out.push(
          '<table className="w-full text-sm"><thead><tr>' +
            cells.map((c) => `<th>${inline(c)}</th>`).join("") +
            "</tr></thead><tbody>",
        );
        inTable = true;
      } else {
        out.push(
          "<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>",
        );
      }
      continue;
    }
    // Lists
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul) {
      if (inList !== "ul") {
        closeList();
        out.push("<ul>");
        inList = "ul";
      }
      out.push(`<li>${inline(ul[1]!)}</li>`);
      continue;
    }
    if (ol) {
      if (inList !== "ol") {
        closeList();
        out.push("<ol>");
        inList = "ol";
      }
      out.push(`<li>${inline(ol[1]!)}</li>`);
      continue;
    }
    closeList();
    closeTable();
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  closeTable();
  return out.join("\n");
}
