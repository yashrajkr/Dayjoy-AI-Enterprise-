"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Network, Plus, Search } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useDistributors } from "@/hooks/use-crm";
import { useDebounce } from "@/hooks/use-debounce";
import { DISTRIBUTOR_TIER_LABELS } from "@/lib/constants";
import type {
  DistributorStatus,
  DistributorTier,
} from "@/types/crm.types";
import {
  cn,
  formatCurrency,
  formatDate,
  formatNumber,
  getStatusColor,
} from "@/lib/utils";

const TIERS: (DistributorTier | "ALL")[] = [
  "ALL",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "DIAMOND",
];

const STATUSES: (DistributorStatus | "ALL")[] = [
  "ALL",
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "PENDING",
];

const TIER_ACCENT: Record<DistributorTier, string> = {
  BRONZE: "bg-amber-700/10 text-amber-700 dark:text-amber-600",
  SILVER: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  GOLD: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500",
  PLATINUM: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  DIAMOND: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

export default function DistributorsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<DistributorTier | "ALL">("ALL");
  const [status, setStatus] = useState<DistributorStatus | "ALL">("ALL");
  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(
    () => ({ search: debouncedSearch, tier, status }),
    [debouncedSearch, tier, status],
  );

  const { data, isLoading, isError } = useDistributors(filters);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((d) => {
      if (tier !== "ALL" && d.tier !== tier) return false;
      if (status !== "ALL" && d.status !== status) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (
          !d.code.toLowerCase().includes(q) &&
          !d.companyName.toLowerCase().includes(q) &&
          !(d.phone ?? "").includes(q)
        )
          return false;
      }
      return true;
    });
  }, [data, tier, status, debouncedSearch]);

  return (
    <>
      <PageHeader
        title="Distributors"
        description="Manage distributor partnerships, tiers, and performance."
        actions={
          <Button asChild size="sm">
            <Link href="/tasks/new">
              <Plus className="h-4 w-4" /> New task for distributor
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, company, phone…"
              className="pl-9"
              aria-label="Search distributors"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={tier} onValueChange={(v) => setTier(v as DistributorTier | "ALL")}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                {TIERS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DISTRIBUTOR_TIER_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as DistributorStatus | "ALL")}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "ALL" ? "All statuses" : s.replace(/_/g, " ").toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <EmptyState title="Couldn't load distributors" description="Please try again in a moment." />
      ) : isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No distributors found"
          description="Try adjusting your search or filters."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="w-[120px]">Tier</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[110px] text-right">Downline</TableHead>
                <TableHead className="w-[130px] text-right">Lifetime</TableHead>
                <TableHead className="w-[110px]">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow
                  key={d.id}
                  onClick={() => router.push(`/crm/distributors/${d.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{d.companyName}</p>
                    {d.city && (
                      <p className="text-xs text-muted-foreground">
                        {d.city}
                        {d.state ? `, ${d.state}` : ""}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{d.contactPerson ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{d.phone ?? "—"}</p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", TIER_ACCENT[d.tier])}
                    >
                      {DISTRIBUTOR_TIER_LABELS[d.tier]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(getStatusColor(d.status))}
                    >
                      {d.status.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(d.totalDownline ?? 0)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatCurrency(d.lifetimeValue, d.currency)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {d.joinedAt ? formatDate(d.joinedAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
