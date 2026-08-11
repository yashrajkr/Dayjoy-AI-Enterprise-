"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Package, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { cn, formatCurrency, getStatusColor } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  currency?: string;
  stock: number;
  status: string;
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.products, debouncedSearch],
    queryFn: async () => {
      try {
        const d = await api.get<Product[]>("/products", {
          search: debouncedSearch || undefined,
        });
        if (Array.isArray(d) && d.length > 0) return d;
        return mockProducts();
      } catch {
        return mockProducts();
      }
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!debouncedSearch) return data;
    const q = debouncedSearch.toLowerCase();
    return data.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [data, debouncedSearch]);

  return (
    <>
      <PageHeader
        title="Products"
        description="Browse the catalog, check stock, and reference product info."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/knowledge?search=product">
              <Plus className="h-4 w-4" /> Product info
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
              placeholder="Search by name, SKU, category…"
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products found"
          description="Try a different search."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[140px]">Category</TableHead>
                <TableHead className="w-[120px] text-right">Price</TableHead>
                <TableHead className="w-[100px] text-right">Stock</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="text-sm font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {p.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatCurrency(p.price, p.currency)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {p.stock}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(getStatusColor(p.status))}
                    >
                      {p.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
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

function mockProducts(): Product[] {
  return [
    { id: "p1", sku: "DJ-WB-001", name: "Wellness Bundle", category: "Bundle", price: 1999, stock: 248, status: "ACTIVE" },
    { id: "p2", sku: "DJ-IMM-100", name: "Immune Boost", category: "Immunity", price: 499, stock: 1200, status: "ACTIVE" },
    { id: "p3", sku: "DJ-ENG-100", name: "Energy Plus", category: "Energy", price: 549, stock: 860, status: "ACTIVE" },
    { id: "p4", sku: "DJ-SLP-100", name: "Calm Sleep", category: "Sleep", price: 599, stock: 0, status: "OUT_OF_STOCK" },
    { id: "p5", sku: "DJ-MVT-100", name: "Daily Multivitamin", category: "Wellness", price: 399, stock: 540, status: "ACTIVE" },
    { id: "p6", sku: "DJ-OMG-100", name: "Omega-3", category: "Wellness", price: 699, stock: 320, status: "ACTIVE" },
    { id: "p7", sku: "DJ-AYR-DET", name: "Ayurvedic Detox", category: "Ayurveda", price: 749, stock: 12, status: "LOW_STOCK" },
  ];
}
