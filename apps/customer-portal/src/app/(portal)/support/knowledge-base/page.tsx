"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Search,
  Loader2,
  AlertCircle,
  Clock,
  ChevronRight,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useKnowledgeArticles } from "@/hooks/use-api";
import { KB_CATEGORIES } from "@/lib/constants";
import { cn, formatRelativeTime } from "@/lib/utils";

/**
 * Knowledge Base — browse articles by category or search by keyword.
 * Clicking an article opens its detail page (rendered by the
 * `[slug]/page.tsx` route in this folder).
 */
export default function KnowledgeBasePage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const { data, isLoading, isError } = useKnowledgeArticles({
    category: activeCategory === "All" ? undefined : activeCategory,
    search: search || undefined,
  });

  const articles = data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Knowledge Base"
        description="In-depth guides on orders, payments, shipping, returns, and your account."
        icon={BookOpen}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search articles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search articles"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CategoryChip
          label="All"
          active={activeCategory === "All"}
          onClick={() => setActiveCategory("All")}
        />
        {KB_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={c}
            active={activeCategory === c}
            onClick={() => setActiveCategory(c)}
          />
        ))}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading articles…
          </CardContent>
        </Card>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load articles"
          description="Please try again later."
        />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={search || activeCategory !== "All" ? "No matching articles" : "No articles yet"}
          description={
            search || activeCategory !== "All"
              ? "Try a different search or category."
              : "Check back soon — we're adding more articles."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {articles.map((a) => (
            <Card
              key={a.id}
              className="group transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <Link href={`/support/knowledge-base/${a.slug}`} className="block">
                <CardHeader className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <Badge variant="muted" className="text-[10px]">
                      {a.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-sm">{a.title}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">
                    {a.excerpt}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {a.readingMinutes ?? 3} min read
                    </span>
                    <span>Updated {formatRelativeTime(a.updatedAt)}</span>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Can't find what you're looking for?
            </p>
            <p className="text-xs text-muted-foreground">
              Ask the AI Assistant for an instant answer, or{" "}
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

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
