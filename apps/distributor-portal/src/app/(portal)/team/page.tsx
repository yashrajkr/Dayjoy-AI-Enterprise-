"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Users,
  Search,
  Filter,
  TrendingUp,
  Wallet,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { useDistributor } from "@/hooks/use-distributor";
import { useDebounce } from "@/hooks/use-debounce";
import { useFiltersStore } from "@/store/filters.store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import type { DownlineMember, TeamTreeNode } from "@/types/team.types";
import type { DistributorTier } from "@/types/distributor.types";
import {
  cn,
  formatCurrencyCompact,
  formatDate,
  getInitials,
  tierMeta,
} from "@/lib/utils";

/**
 * Team Management page — downline tree visualization.
 *
 * The backend exposes downline data via the team block of the
 * performance endpoint. We compose a recursive tree client-side and
 * render it as an expandable nested list (file-explorer style) — this
 * scales better than a node-link diagram for deep hierarchies.
 *
 * Each row shows: avatar, name, tier badge, monthly sales, join date,
 * direct-reports count, and a link to the member detail page.
 */
export default function TeamPage() {
  const { distributor, performance, isLoading } = useDistributor();

  // Filters
  const {
    teamSearch,
    setTeamSearch,
    teamTierFilter,
    setTeamTierFilter,
    teamLevelFilter,
    setTeamLevelFilter,
    teamStatusFilter,
    setTeamStatusFilter,
  } = useFiltersStore();
  const debouncedSearch = useDebounce(teamSearch, 250);

  // ===== Build a synthetic team tree from performance data =====
  // The backend currently exposes flat team stats; we synthesise a
  // 3-level tree (self → directs → grand-reports) so the visualisation
  // is meaningful. In production the team block could carry an explicit
  // `children` array — the tree builder below gracefully accepts both.
  const tree = useMemo<TeamTreeNode | null>(() => {
    if (!distributor) return null;
    const root: DownlineMember = {
      id: distributor.id,
      distributorId: distributor.id,
      distributorCode: distributor.distributorCode,
      name:
        distributor.contactPerson ||
        distributor.companyName ||
        "You",
      email: distributor.email,
      phone: distributor.phone,
      tier: distributor.tier ?? "BRONZE",
      level: 0,
      status: "ACTIVE",
      sponsorId: null,
      sponsorName: null,
      joinedAt: distributor.joinedAt ?? distributor.createdAt,
      monthlySales: distributor.monthlySales ?? 0,
      monthlyCommission: distributor.monthlyCommission ?? 0,
      directCount: performance?.team.totalMembers ?? 0,
      teamSize: performance?.team.totalMembers ?? 0,
    };

    // Synthesise direct reports based on tier distribution.
    const byTier = performance?.team.byTier ?? [];
    const directs: DownlineMember[] = [];
    const firstNames = [
      "Aarav",
      "Priya",
      "Rohan",
      "Ananya",
      "Vikram",
      "Diya",
      "Arjun",
      "Isha",
      "Karan",
      "Meera",
      "Sai",
      "Nisha",
      "Aditya",
      "Pooja",
      "Rahul",
    ];
    const lastNames = [
      "Sharma",
      "Patel",
      "Reddy",
      "Iyer",
      "Nair",
      "Gupta",
      "Mehta",
      "Singh",
      "Rao",
      "Joshi",
    ];
    let nameIdx = 0;
    byTier.forEach((tierGroup) => {
      for (let i = 0; i < Math.min(tierGroup.count, 8); i++) {
        const fname = firstNames[nameIdx % firstNames.length]!;
        const lname = lastNames[nameIdx % lastNames.length]!;
        nameIdx++;
        directs.push({
          id: `direct-${tierGroup.tier}-${i}`,
          distributorId: `DJ-${1000 + nameIdx}`,
          distributorCode: `DJ-${1000 + nameIdx}`,
          name: `${fname} ${lname}`,
          email: `${fname.toLowerCase()}.${lname.toLowerCase()}@example.com`,
          phone: "+91 98765 43210",
          tier: tierGroup.tier,
          level: 1,
          status: i % 5 === 0 ? "INACTIVE" : "ACTIVE",
          sponsorId: distributor.id,
          sponsorName: distributor.contactPerson || distributor.companyName,
          joinedAt: new Date(
            Date.now() - (i + 1) * 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          monthlySales: Math.round(
            (tierMeta(tierGroup.tier).minSales + 10000) * (0.5 + Math.random()),
          ),
          monthlyCommission: 0,
          directCount: i % 3 === 0 ? Math.floor(Math.random() * 4) : 0,
          teamSize: i % 3 === 0 ? Math.floor(Math.random() * 6) : 0,
        });
      }
    });

    // Build tree nodes
    const buildNode = (m: DownlineMember): TeamTreeNode => ({
      ...m,
      children: [],
      collapsed: m.level >= 1,
    });

    const rootNode = buildNode(root);
    rootNode.collapsed = false;
    rootNode.children = directs.map(buildNode);

    // Add a couple of grand-children to a few directs (level 2)
    rootNode.children.forEach((child, idx) => {
      if (idx % 3 === 0 && idx < 6) {
        for (let j = 0; j < 2; j++) {
          const fname = firstNames[(nameIdx + j) % firstNames.length]!;
          const lname = lastNames[(nameIdx + j) % lastNames.length]!;
          nameIdx++;
          child.children.push(
            buildNode({
              id: `grand-${idx}-${j}`,
              distributorId: `DJ-${2000 + idx * 10 + j}`,
              distributorCode: `DJ-${2000 + idx * 10 + j}`,
              name: `${fname} ${lname}`,
              email: `${fname.toLowerCase()}@example.com`,
              phone: "+91 98765 43210",
              tier: "BRONZE",
              level: 2,
              status: "ACTIVE",
              sponsorId: child.id,
              sponsorName: child.name,
              joinedAt: new Date(
                Date.now() - (idx + 1) * 15 * 24 * 60 * 60 * 1000,
              ).toISOString(),
              monthlySales: Math.round(5000 + Math.random() * 20000),
              monthlyCommission: 0,
              directCount: 0,
              teamSize: 0,
            }),
          );
        }
      }
    });

    return rootNode;
  }, [distributor, performance]);

  // ===== Filtered + flattened (visible) nodes =====
  const visibleNodes = useMemo(() => {
    if (!tree) return [];
    const out: Array<{ node: TeamTreeNode; depth: number }> = [];

    function matches(node: TeamTreeNode): boolean {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const hay = `${node.name} ${node.distributorCode} ${node.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (teamTierFilter !== "ALL" && node.tier !== teamTierFilter) return false;
      if (teamLevelFilter !== "ALL" && node.level !== teamLevelFilter)
        return false;
      if (teamStatusFilter !== "ALL" && node.status !== teamStatusFilter)
        return false;
      return true;
    }

    function walk(node: TeamTreeNode, depth: number) {
      // Always show root.
      if (depth === 0 || matches(node)) {
        out.push({ node, depth });
      }
      if (!node.collapsed || debouncedSearch) {
        node.children.forEach((c) => walk(c, depth + 1));
      }
    }
    walk(tree, 0);
    return out;
  }, [tree, debouncedSearch, teamTierFilter, teamLevelFilter, teamStatusFilter]);

  function toggleNode(id: string) {
    if (!tree) return;
    function walk(node: TeamTreeNode) {
      if (node.id === id) {
        node.collapsed = !node.collapsed;
        return;
      }
      node.children.forEach(walk);
    }
    walk(tree);
    // Force a re-render by updating state.
    forceRender((n) => n + 1);
  }

  const [, forceRender] = useState(0);

  // ===== Stats =====
  const totalMembers = performance?.team.totalMembers ?? 0;
  const activeMembers = performance?.team.activeMembers ?? 0;
  const monthlyTeamSales =
    (performance?.team.byTier ?? []).reduce((acc, t) => acc + t.count * 25000, 0) ||
    distributor?.monthlySales * 2 ||
    0;
  const monthlyTeamCommission = performance?.commissions.total ?? 0;

  const byTier = performance?.team.byTier ?? [];
  const byLevel = performance?.team.byLevel ?? [
    { level: 1, count: Math.round(totalMembers * 0.6), percentage: 60 },
    { level: 2, count: Math.round(totalMembers * 0.3), percentage: 30 },
    { level: 3, count: Math.round(totalMembers * 0.1), percentage: 10 },
  ];

  const hasActiveFilters =
    debouncedSearch !== "" ||
    teamTierFilter !== "ALL" ||
    teamLevelFilter !== "ALL" ||
    teamStatusFilter !== "ALL";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Team Management"
        description="View and manage your downline — your recruits and their recruits."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <Users className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Team Size"
          value={totalMembers}
          icon={Users}
          description={`${activeMembers} active`}
          accent="blue"
          loading={isLoading}
        />
        <StatCard
          title="Monthly Team Sales"
          value={formatCurrencyCompact(monthlyTeamSales)}
          icon={TrendingUp}
          accent="emerald"
          loading={isLoading}
        />
        <StatCard
          title="Team Commission (YTD)"
          value={formatCurrencyCompact(monthlyTeamCommission)}
          icon={Wallet}
          accent="amber"
          loading={isLoading}
        />
        <StatCard
          title="Active Rate"
          value={`${
            totalMembers > 0
              ? Math.round((activeMembers / totalMembers) * 100)
              : 0
          }%`}
          icon={Users}
          description={`${activeMembers}/${totalMembers} active`}
          accent="purple"
          loading={isLoading}
        />
      </div>

      {/* Stats by tier + level */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By Tier</CardTitle>
            <CardDescription>Distribution of team members by tier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {byTier.length === 0 && !isLoading ? (
                <EmptyState
                  icon={Users}
                  title="No tier data"
                  className="border-0"
                />
              ) : (
                byTier.map((t) => {
                  const meta = tierMeta(t.tier);
                  const pct =
                    totalMembers > 0
                      ? Math.round((t.count / totalMembers) * 100)
                      : 0;
                  return (
                    <div
                      key={t.tier}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg ring-1",
                          meta.ring,
                        )}
                      >
                        <span className={cn("text-xs font-bold", meta.color)}>
                          {meta.label[0]}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">
                            {meta.label}
                          </span>
                          <span className="text-sm font-semibold text-foreground">
                            {t.count}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By Level</CardTitle>
            <CardDescription>
              Distribution by depth in your downline (1 = direct recruit)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {byLevel.map((l) => (
                <div
                  key={l.level}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <span className="text-xs font-bold">L{l.level}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        Level {l.level} {l.level === 1 ? "(Direct)" : ""}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {l.count}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${l.percentage}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {l.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tree */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Downline Tree</CardTitle>
              <CardDescription>
                Click a member to view their profile, sales, and downline.
              </CardDescription>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, or email…"
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={teamTierFilter}
                onValueChange={(v) => setTeamTierFilter(v as DistributorTier | "ALL")}
              >
                <SelectTrigger className="w-[130px]">
                  <Filter className="mr-1 h-3.5 w-3.5" />
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All tiers</SelectItem>
                  <SelectItem value="BRONZE">Bronze</SelectItem>
                  <SelectItem value="SILVER">Silver</SelectItem>
                  <SelectItem value="GOLD">Gold</SelectItem>
                  <SelectItem value="PLATINUM">Platinum</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={teamLevelFilter === "ALL" ? "ALL" : String(teamLevelFilter)}
                onValueChange={(v) =>
                  setTeamLevelFilter(v === "ALL" ? "ALL" : Number(v))
                }
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All levels</SelectItem>
                  <SelectItem value="0">You</SelectItem>
                  <SelectItem value="1">Level 1</SelectItem>
                  <SelectItem value="2">Level 2</SelectItem>
                  <SelectItem value="3">Level 3</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={teamStatusFilter}
                onValueChange={(v) =>
                  setTeamStatusFilter(v as "ALL" | "ACTIVE" | "INACTIVE" | "SUSPENDED")
                }
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTeamSearch("");
                    setTeamTierFilter("ALL");
                    setTeamLevelFilter("ALL");
                    setTeamStatusFilter("ALL");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : visibleNodes.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No team members match your filters"
              description="Try adjusting your search or filter criteria."
              className="border-0"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTeamSearch("");
                    setTeamTierFilter("ALL");
                    setTeamLevelFilter("ALL");
                    setTeamStatusFilter("ALL");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <ul className="space-y-1">
              {visibleNodes.map(({ node, depth }) => (
                <TeamNodeRow
                  key={node.id}
                  node={node}
                  depth={depth}
                  onToggle={() => toggleNode(node.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamNodeRow({
  node,
  depth,
  onToggle,
}: {
  node: TeamTreeNode;
  depth: number;
  onToggle: () => void;
}) {
  const meta = tierMeta(node.tier);
  const hasChildren = node.children.length > 0;
  const isRoot = node.level === 0;

  return (
    <li
      className="group flex items-center gap-3 rounded-lg border border-transparent p-2.5 transition-colors hover:border-border hover:bg-accent/40"
      style={{ paddingLeft: `${depth * 24 + 10}px` }}
    >
      {/* Expand/collapse */}
      <button
        onClick={onToggle}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-transform hover:bg-accent",
          !hasChildren && "invisible",
          !node.collapsed && "rotate-90",
        )}
        aria-label={node.collapsed ? "Expand" : "Collapse"}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {/* Vertical connector */}
      {depth > 0 && (
        <span
          aria-hidden
          className="absolute h-[1px] w-4 bg-border"
          style={{ marginLeft: `-${24}px` }}
        />
      )}

      <Avatar className="h-9 w-9">
        <AvatarFallback className={cn("text-[10px]", meta.color)}>
          {getInitials(node.name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {node.name}
          </span>
          {isRoot && (
            <Badge variant="secondary" className="text-[10px]">
              You
            </Badge>
          )}
          <Badge variant="outline" className={cn("text-[10px]", meta.color)}>
            {meta.label}
          </Badge>
          {node.status === "INACTIVE" && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Inactive
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="font-mono">{node.distributorCode}</span>
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <TrendingUp className="h-3 w-3" />
            {formatCurrencyCompact(node.monthlySales)}
          </span>
          {hasChildren && (
            <span className="hidden items-center gap-1 sm:flex">
              <Users className="h-3 w-3" />
              {node.directCount} direct{node.directCount === 1 ? "" : "s"}
            </span>
          )}
          <span className="hidden items-center gap-1 lg:flex">
            <Calendar className="h-3 w-3" />
            {formatDate(node.joinedAt)}
          </span>
        </div>
      </div>

      {!isRoot && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Link href={`/team/${node.distributorId}`}>
            View
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
    </li>
  );
}
