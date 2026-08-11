"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKnowledgeArticles } from "@/hooks/use-knowledge";
import { useDebounce } from "@/hooks/use-debounce";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils";
import type { KnowledgeArticleSummary } from "@/hooks/use-knowledge";

export default function KnowledgePage() {
  const { data, isLoading, isError } = useKnowledgeArticles();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const grouped = useMemo(() => {
    if (!data)
      return [] as {
        category: string;
        categorySlug: string;
        articles: KnowledgeArticleSummary[];
      }[];
    const filtered = debouncedSearch
      ? data.filter(
          (a) =>
            a.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (a.summary ?? "").toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (a.tags ?? []).some((t) =>
              t.toLowerCase().includes(debouncedSearch.toLowerCase()),
            ),
        )
      : data;

    return KNOWLEDGE_CATEGORIES.map((cat) => ({
      category: cat.label,
      categorySlug: cat.slug,
      articles: filtered.filter((a) => a.categorySlug === cat.slug),
    })).filter((c) => c.articles.length > 0);
  }, [data, debouncedSearch]);

  const total = data?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description={`${total} articles across SOPs, policies, products, training, compliance & more.`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/ai-assistant?prompt=Summarise the return policy">
              Ask AI about KB
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles by title, summary, or tag…"
              className="pl-9"
              aria-label="Search knowledge base"
            />
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <EmptyState title="Couldn't load articles" description="Please try again in a moment." />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No matching articles"
          description="Try a different search term."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.categorySlug}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.category}
                <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {group.articles.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.articles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function ArticleCard({ article }: { article: KnowledgeArticleSummary }) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{article.title}</CardTitle>
        {article.summary && (
          <CardDescription className="line-clamp-2">
            {article.summary}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {article.tags?.slice(0, 3).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Updated {formatRelativeTime(article.updatedAt)}
            {article.readTimeMins ? ` · ${article.readTimeMins}m read` : ""}
          </span>
          <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
            <Link href={`/knowledge/${article.slug}`}>
              Read <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
