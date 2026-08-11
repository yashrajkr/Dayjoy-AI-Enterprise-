"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  Megaphone,
  Pin,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { announcementsService } from "@/lib/services";
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABELS,
} from "@/lib/constants";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";
import type { Announcement } from "@/types";

const CATEGORY_COLOR: Record<string, string> = {
  COMPANY: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  PRODUCT: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  EVENT: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  PROMOTION: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

export default function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Announcement | null>(null);

  const { data: announcements, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["announcements", { category: categoryFilter }],
    queryFn: () =>
      announcementsService.list({
        category: categoryFilter !== "all" ? categoryFilter : undefined,
      }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => announcementsService.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  const openAnnouncement = (a: Announcement) => {
    setSelected(a);
    if (!a.read) markReadMutation.mutate(a.id);
  };

  const filtered = (announcements ?? []).filter(
    (a) =>
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.summary.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Company news, product launches, promotions, and event updates."
        icon={Megaphone}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search announcements…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search announcements"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {ANNOUNCEMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {ANNOUNCEMENT_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isError && (
        <InlineAlert variant="error">
          Failed to load announcements: {(error as Error)?.message ?? "Unknown error"}.{" "}
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
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements"
          description="Try adjusting your filters."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <Card
              key={a.id}
              interactive
              className={cn(
                "cursor-pointer transition-all",
                !a.read && "border-primary/30 bg-primary/[0.02]",
              )}
              onClick={() => openAnnouncement(a)}
            >
              <CardContent className="flex items-start gap-3 p-4">
                {a.pinned && (
                  <Pin className="mt-1 h-4 w-4 shrink-0 fill-primary text-primary" />
                )}
                {!a.pinned && (
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/40" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{a.title}</p>
                    <Badge
                      className={cn(
                        "border-transparent",
                        CATEGORY_COLOR[a.category],
                      )}
                    >
                      {ANNOUNCEMENT_CATEGORY_LABELS[a.category]}
                    </Badge>
                    {!a.read && (
                      <Badge variant="default" dot>
                        New
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {a.summary}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    By {a.author} · {formatRelativeTime(a.publishedAt)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Announcement detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.pinned && (
                    <Badge variant="default">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </Badge>
                  )}
                  <Badge
                    className={cn(
                      "border-transparent",
                      CATEGORY_COLOR[selected.category],
                    )}
                  >
                    {ANNOUNCEMENT_CATEGORY_LABELS[selected.category]}
                  </Badge>
                </div>
                <DialogTitle className="text-xl">{selected.title}</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  By {selected.author} · {formatDateTime(selected.publishedAt)}
                </p>
              </DialogHeader>
              <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-p:text-muted-foreground whitespace-pre-wrap text-sm text-foreground">
                {selected.body}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
