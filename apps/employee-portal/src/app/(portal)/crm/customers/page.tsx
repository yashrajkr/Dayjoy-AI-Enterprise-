"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
import { useCustomers } from "@/hooks/use-crm";
import { useDebounce } from "@/hooks/use-debounce";
import {
  CUSTOMER_TYPE_LABELS,
} from "@/lib/constants";
import type { CustomerStatus, CustomerType } from "@/types/crm.types";
import {
  cn,
  formatCurrency,
  formatDate,
  formatNumber,
  getStatusColor,
} from "@/lib/utils";

const TYPES: (CustomerType | "ALL")[] = [
  "ALL",
  "INDIVIDUAL",
  "DISTRIBUTOR",
  "RESELLER",
  "WHOLESALE",
];

const STATUSES: (CustomerStatus | "ALL")[] = [
  "ALL",
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "BLACKLISTED",
];

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") ?? "";

  const [search, setSearch] = useState(initialSearch);
  const [type, setType] = useState<CustomerType | "ALL">("ALL");
  const [status, setStatus] = useState<CustomerStatus | "ALL">("ALL");
  const debouncedSearch = useDebounce(search, 300);

  // Keep the URL in sync (so links from elsewhere land here pre-filtered).
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (debouncedSearch) params.set("search", debouncedSearch);
    else params.delete("search");
    const qs = params.toString();
    router.replace(qs ? `/crm/customers?${qs}` : "/crm/customers");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filters = useMemo(
    () => ({ search: debouncedSearch, type, status }),
    [debouncedSearch, type, status],
  );

  const { data, isLoading, isError } = useCustomers(filters);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((c) => {
      if (type !== "ALL" && c.type !== type) return false;
      if (status !== "ALL" && c.status !== status) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !(c.email ?? "").toLowerCase().includes(q) &&
          !(c.phone ?? "").includes(q)
        )
          return false;
      }
      return true;
    });
  }, [data, type, status, debouncedSearch]);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Look up customers, view history, and start follow-up tasks."
        actions={
          <Button asChild size="sm">
            <Link href="/tasks/new">
              <Plus className="h-4 w-4" /> New task for customer
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
              placeholder="Search by name, email, phone…"
              className="pl-9"
              aria-label="Search customers"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={type} onValueChange={(v) => setType(v as CustomerType | "ALL")}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CUSTOMER_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as CustomerStatus | "ALL")}>
              <SelectTrigger className="h-9 w-[150px]">
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
        <EmptyState title="Couldn't load customers" description="Please try again in a moment." />
      ) : isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers found"
          description="Try adjusting your search or filters."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="w-[120px]">Type</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[120px] text-right">LTV</TableHead>
                <TableHead className="w-[100px] text-right">Orders</TableHead>
                <TableHead className="w-[120px]">Last order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.id}
                  onClick={() => router.push(`/crm/customers/${c.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">
                      {c.name}
                    </p>
                    {c.city && (
                      <p className="text-xs text-muted-foreground">
                        {c.city}
                        {c.state ? `, ${c.state}` : ""}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{c.email ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {CUSTOMER_TYPE_LABELS[c.type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(getStatusColor(c.status))}
                    >
                      {c.status.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatCurrency(c.lifetimeValue, c.currency)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatNumber(c.totalOrders ?? 0)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}
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
