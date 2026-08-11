"use client";

import { useMemo, useState } from "react";
import { HelpCircle, Search, Loader2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FaqItemRow } from "@/components/support/faq-item";
import { useFaqs } from "@/hooks/use-api";
import { FAQ_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * FAQs — searchable, category-filtered list of frequently asked
 * questions. Each item is an expandable row (`FaqItemRow`) with a
 * "Was this helpful?" feedback row.
 */
export default function FaqsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const { data, isLoading, isError } = useFaqs({
    category: activeCategory === "All" ? undefined : activeCategory,
    search: search || undefined,
  });

  const faqs = data ?? [];
  const openItem = useMemo(() => (faqs[0]?.id ?? ""), [faqs]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Frequently Asked Questions"
        description="Quick answers to the questions we hear most often."
        icon={HelpCircle}
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search FAQs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search FAQs"
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        <CategoryChip
          label="All"
          active={activeCategory === "All"}
          onClick={() => setActiveCategory("All")}
        />
        {FAQ_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={c}
            active={activeCategory === c}
            onClick={() => setActiveCategory(c)}
          />
        ))}
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading FAQs…
            </div>
          ) : isError ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load FAQs"
              description="Please try again later."
            />
          ) : faqs.length === 0 ? (
            <EmptyState
              icon={HelpCircle}
              title={
                search || activeCategory !== "All"
                  ? "No matching FAQs"
                  : "No FAQs yet"
              }
              description={
                search || activeCategory !== "All"
                  ? "Try a different search or category."
                  : "Check back soon — we're adding more FAQs."
              }
            />
          ) : (
            <Accordion type="single" collapsible defaultValue={openItem}>
              {faqs.map((faq) => (
                <FaqItemRow key={faq.id} faq={faq} />
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* CTA */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Still need help?
            </p>
            <p className="text-xs text-muted-foreground">
              Our AI Assistant can answer in seconds, or chat with a human agent.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/ai-assistant">Ask AI</a>
            </Button>
            <Button asChild size="sm">
              <a href="/support/live-chat">Live chat</a>
            </Button>
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
