"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Brain, FileText, Filter, Search, Sparkles, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ErrorBanner,
  FilterSelect,
  LoadingSpinner,
  TagList,
  ToastViewport,
  useDebounce,
  useToast,
} from "@/components/features/_shared";
import { knowledgeService } from "@/components/features/_shared";
import type { RagAnswer } from "@/components/features/_shared";

const SOURCE_OPTIONS = [
  { label: "Upload", value: "UPLOAD" },
  { label: "Web", value: "WEB" },
  { label: "Manual", value: "MANUAL" },
  { label: "API", value: "API" },
  { label: "FAQ", value: "FAQ" },
];

export default function KnowledgeSearchPage() {
  const router = useRouter();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  // "Ask AI" dialog state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<RagAnswer | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["knowledge", "categories"],
    queryFn: () => knowledgeService.listCategories(),
  });

  const hasQuery = debouncedQuery.trim().length > 0;
  const { data: searchResult, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["knowledge", "search", debouncedQuery, categoryFilter, sourceFilter, tagFilter],
    queryFn: () =>
      knowledgeService.search({
        query: debouncedQuery,
        categories: categoryFilter ? [categoryFilter] : undefined,
        sources: sourceFilter ? [sourceFilter] : undefined,
        tags: tagFilter ? [tagFilter] : undefined,
        topK: 10,
      }),
    enabled: hasQuery,
  });

  const askAi = async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const ans = await knowledgeService.askRag(aiQuestion);
      setAiAnswer(ans);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "RAG query failed.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <ToastViewport />
      <PageHeader
        title="Knowledge Search"
        description="Search the knowledge base semantically. Highlight matches and ask the AI."
        icon={Search}
        actions={
          <Button onClick={() => setAiOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            Ask AI
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Ask anything... e.g. 'return policy for opened items'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 pl-10 text-base"
              autoFocus
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <FilterSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={(categories ?? []).map((c) => ({ label: c.name, value: c.name }))}
              placeholder="All categories"
              ariaLabel="Filter by category"
              className="w-44"
            />
            <FilterSelect
              value={sourceFilter}
              onChange={setSourceFilter}
              options={SOURCE_OPTIONS}
              placeholder="All sources"
              ariaLabel="Filter by source"
              className="w-40"
            />
            <Input
              placeholder="Tag (e.g. policy)"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-40"
            />
            {(categoryFilter || sourceFilter || tagFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCategoryFilter("");
                  setSourceFilter("");
                  setTagFilter("");
                }}
              >
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
            {searchResult && (
              <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <span>{searchResult.total} results</span>
                <span>·</span>
                <span>{Math.round(searchResult.latencyMs)}ms</span>
                <span>·</span>
                <span>{Math.round(searchResult.confidence * 100)}% confidence</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!hasQuery ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-aurora/10">
                <Brain className="h-7 w-7 text-cyan" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">Search the knowledge base</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Type a question or keyword above. Results show matching chunks with relevance scores and highlighted matches.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["What is the return policy?", "How long is the warranty?", "Do you ship internationally?"].map((q) => (
                  <Button key={q} variant="outline" size="sm" onClick={() => setQuery(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent>
            <LoadingSpinner label="Searching..." />
          </CardContent>
        </Card>
      ) : isError ? (
        <ErrorBanner message={(error as Error)?.message ?? "Search failed"} onRetry={() => refetch()} />
      ) : !searchResult || searchResult.results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No matching chunks found. Try rephrasing your query or removing filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {searchResult.results.map((result, idx) => (
            <Card key={result.chunkId} interactive className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-aurora/10 text-xs font-mono text-cyan">
                        {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => router.push(`/knowledge/documents/${result.documentId}`)}
                        className="truncate text-left text-sm font-medium text-foreground hover:text-cyan hover:underline"
                      >
                        <FileText className="mr-1.5 inline h-3.5 w-3.5" />
                        {result.documentTitle}
                      </button>
                      {result.page && (
                        <Badge variant="outline" className="font-mono">
                          p.{result.page}
                        </Badge>
                      )}
                      {result.headingPath.length > 0 && (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {result.headingPath.join(" › ")}
                        </span>
                      )}
                    </div>
                    <p
                      className="mt-2 text-sm text-foreground/80"
                      dangerouslySetInnerHTML={{ __html: result.highlightedContent }}
                    />
                    {result.tags.length > 0 && (
                      <div className="mt-2">
                        <TagList tags={result.tags} />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-cyan">
                      <Zap className="h-3 w-3" />
                      <span className="font-mono">{Math.round(result.score * 100)}%</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      sem {Math.round(result.semanticScore * 100)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      kw {Math.round(result.keywordScore * 100)}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Ask AI Dialog */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan" />
              Ask the AI
            </DialogTitle>
            <DialogDescription>
              Ask a question — the AI retrieves relevant chunks from the knowledge base and synthesises an answer with citations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="ai-question">Question</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="ai-question"
                  placeholder="e.g. What is the return policy for opened items?"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && askAi()}
                  autoFocus
                />
                <Button onClick={askAi} disabled={aiLoading || !aiQuestion.trim()}>
                  {aiLoading ? "Thinking..." : "Ask"}
                </Button>
              </div>
            </div>

            {aiLoading && <LoadingSpinner label="Retrieving and synthesising answer..." />}

            {aiAnswer && (
              <div className="space-y-3">
                <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <Badge variant="live" dot>
                      Answer
                    </Badge>
                    <span className="text-muted-foreground">
                      Confidence: {Math.round(aiAnswer.confidence * 100)}% · {Math.round(aiAnswer.latencyMs)}ms
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">{aiAnswer.answer}</p>
                </div>
                {aiAnswer.citations.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Citations
                    </p>
                    <div className="space-y-2">
                      {aiAnswer.citations.map((cite, i) => (
                        <button
                          key={cite.chunkId}
                          type="button"
                          onClick={() => {
                            setAiOpen(false);
                            router.push(`/knowledge/documents/${cite.documentId}`);
                          }}
                          className="block w-full rounded-lg border border-border/60 bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.04]"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded bg-aurora/10 text-xs font-mono text-cyan">
                                {i + 1}
                              </span>
                              <span className="text-sm font-medium text-foreground">{cite.documentTitle}</span>
                              {cite.page && (
                                <Badge variant="outline" className="font-mono">
                                  p.{cite.page}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-cyan">{Math.round(cite.score * 100)}%</span>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{cite.snippet}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
