"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, subMonths, format, parseISO } from "date-fns";
import {
  ShoppingCart,
  Download,
  TrendingUp,
  FileBarChart,
  Package,
  Tag,
  Filter,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { QUERY_KEYS } from "@/lib/constants";
import {
  getSalesReport,
  summariseSales,
  type SalesReportRow,
} from "@/lib/mock-data";
import { cn, downloadCSV, formatCurrency, formatDate, formatNumber } from "@/lib/utils";

const RANGES = [
  { label: "Last 7 days", value: "7d", days: 7 },
  { label: "Last 30 days", value: "30d", days: 30 },
  { label: "Last 90 days", value: "90d", days: 90 },
  { label: "Last 6 months", value: "6m", days: 180 },
];

export default function SalesReportPage() {
  const [range, setRange] = useState("30d");
  const [product, setProduct] = useState("all");
  const [category, setCategory] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [search, setSearch] = useState("");

  const rangeDef = RANGES.find((r) => r.value === range) ?? RANGES[1]!;
  const startDate = subDays(new Date(), rangeDef.days);
  const endDate = new Date();

  const reportQuery = useQuery({
    queryKey: QUERY_KEYS.reportSales(range),
    queryFn: () => getSalesReport(startDate, endDate),
  });

  const summary = useMemo(() => {
    if (!reportQuery.data) return null;
    return summariseSales(reportQuery.data);
  }, [reportQuery.data]);

  const productOptions = useMemo(() => {
    if (!reportQuery.data) return [];
    return [...new Set(reportQuery.data.map((r) => r.product))].sort();
  }, [reportQuery.data]);
  const categoryOptions = useMemo(() => {
    if (!reportQuery.data) return [];
    return [...new Set(reportQuery.data.map((r) => r.category))].sort();
  }, [reportQuery.data]);
  const customerOptions = useMemo(() => {
    if (!reportQuery.data) return [];
    return [...new Set(reportQuery.data.map((r) => r.customer))].sort();
  }, [reportQuery.data]);

  const filtered = useMemo(() => {
    if (!reportQuery.data) return [];
    return reportQuery.data.filter((r) => {
      if (product !== "all" && r.product !== product) return false;
      if (category !== "all" && r.category !== category) return false;
      if (customer !== "all" && r.customer !== customer) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.order.toLowerCase().includes(q) &&
          !r.customer.toLowerCase().includes(q) &&
          !r.product.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [reportQuery.data, product, category, customer, search]);

  function handleExportCSV() {
    if (!filtered.length) {
      return;
    }
    const rows = filtered.map((r: SalesReportRow) => ({
      Date: format(parseISO(r.date), "yyyy-MM-dd"),
      Order: r.order,
      Customer: r.customer,
      Product: r.product,
      Category: r.category,
      Quantity: r.quantity,
      Total: r.total,
    }));
    downloadCSV(`sales-report-${range}-${format(new Date(), "yyyyMMdd")}.csv`, rows);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Report"
        description={`Revenue, orders, and product performance — ${rangeDef.label.toLowerCase()}.`}
        icon={ShoppingCart}
        actions={
          <Button variant="outline" onClick={handleExportCSV} disabled={!filtered.length}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="range">Date range</Label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger id="range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product">Product</Label>
              <Select value={product} onValueChange={setProduct}>
                <SelectTrigger id="product">
                  <SelectValue placeholder="All products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All products</SelectItem>
                  {productOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer">Customer</Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger id="customer">
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {customerOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Order, customer, product…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total sales"
          value={summary ? formatCurrency(summary.totalSales) : "—"}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="text-emerald-500"
        />
        <SummaryCard
          label="Orders"
          value={summary ? formatNumber(summary.orders) : "—"}
          icon={<ShoppingCart className="h-4 w-4" />}
          accent="text-cyan"
        />
        <SummaryCard
          label="Avg order value"
          value={summary ? formatCurrency(summary.avgOrderValue) : "—"}
          icon={<FileBarChart className="h-4 w-4" />}
          accent="text-amber-500"
        />
        <SummaryCard
          label="Top product"
          value={summary?.topProduct.product ?? "—"}
          sub={summary ? formatCurrency(summary.topProduct.total) : ""}
          icon={<Package className="h-4 w-4" />}
          accent="text-indigo"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sales trend</CardTitle>
            <CardDescription>Daily revenue across the selected range.</CardDescription>
          </CardHeader>
          <CardContent>
            {!summary ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={summary.byDay} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-sales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(156 64% 48%)" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="hsl(156 64% 48%)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(222 12% 62%)"
                    fontSize={10}
                    tickFormatter={(d) => format(parseISO(d), "MMM d")}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(222 12% 62%)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(230 18% 9%)",
                      border: "1px solid hsl(230 15% 20%)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(220 25% 95%)" }}
                    labelFormatter={(d) => format(parseISO(String(d)), "MMM d, yyyy")}
                    formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(156 64% 48%)"
                    strokeWidth={2}
                    fill="url(#grad-sales)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
            <CardDescription>Revenue distribution across product categories.</CardDescription>
          </CardHeader>
          <CardContent>
            {!summary ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={summary.byCategory} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="hsl(222 12% 62%)"
                    fontSize={10}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    stroke="hsl(222 12% 62%)"
                    fontSize={11}
                    width={100}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(230 18% 9%)",
                      border: "1px solid hsl(230 15% 20%)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(220 25% 95%)" }}
                    formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                    cursor={{ fill: "hsl(0 0% 100% / 0.04)" }}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {summary.byCategory.map((_, i) => (
                      <Cell key={i} fill={`hsl(${(i * 47) % 360} 70% 60%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* By product table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" /> Top products
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!summary ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">% of total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byProduct.slice(0, 8).map((p) => (
                  <TableRow key={p.product}>
                    <TableCell className="font-medium">{p.product}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(p.total)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {summary.totalSales ? ((p.total / summary.totalSales) * 100).toFixed(1) : "0"}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detailed orders table */}
      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>
            {filtered.length} order{filtered.length === 1 ? "" : "s"} match your filters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <ScrollArea className="max-h-[28rem]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: SalesReportRow) => (
                    <TableRow key={r.order}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(r.date)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.order}</TableCell>
                      <TableCell>{r.customer}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{r.product}</span>
                          <Badge variant="outline" className="mt-0.5 w-fit text-[10px]">
                            {r.category}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(r.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.1] py-12 text-center text-sm text-muted-foreground">
              No orders match your filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.04]", accent)}>
            {icon}
          </span>
        </div>
        <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
