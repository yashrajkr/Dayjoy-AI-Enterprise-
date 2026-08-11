"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Package,
  Gift,
  TrendingUp,
  Bell,
  Bot,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { QUERY_KEYS, ROUTES, APP_NAME } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  titleCase,
  getStatusColor,
} from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCard } from "@/components/products/product-card";
import type { Order } from "@/types/order.types";
import type { Notification } from "@/types/notification.types";
import type { ProductRecommendation } from "@/types/product.types";

export default function DashboardPage() {
  const { user } = useAuth();

  const ordersQuery = useQuery({
    queryKey: QUERY_KEYS.orders,
    queryFn: () =>
      api.paginated<Order>("/orders", { limit: 5, sort: "date_desc" }),
    staleTime: 60 * 1000,
  });

  const notificationsQuery = useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: () => api.paginated<Notification>("/notifications", { limit: 4 }),
    staleTime: 30 * 1000,
  });

  const recommendationsQuery = useQuery({
    queryKey: QUERY_KEYS.recommendedProducts,
    queryFn: () => api.get<ProductRecommendation[]>("/products/recommended"),
    staleTime: 5 * 60 * 1000,
  });

  const stats = computeStats(ordersQuery.data?.data ?? [], user);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.firstName ?? "there";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greeting}, ${firstName} 👋`}
        description="Here's what's happening with your account today."
        actions={
          <Button asChild variant="gradient" size="sm">
            <Link href="/products">
              <ShoppingBag className="h-4 w-4" /> Shop now
            </Link>
          </Button>
        }
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={ShoppingBag}
          label="Total Orders"
          value={stats.totalOrders}
          loading={ordersQuery.isLoading}
          accent="bg-primary/10 text-primary"
        />
        <StatCard
          icon={Package}
          label="Active Orders"
          value={stats.activeOrders}
          loading={ordersQuery.isLoading}
          accent="bg-info/10 text-info"
        />
        <StatCard
          icon={Gift}
          label="Reward Points"
          value={stats.rewardPoints}
          loading={false}
          accent="bg-warning/10 text-warning"
        />
        <StatCard
          icon={TrendingUp}
          label="Lifetime Spend"
          value={formatCurrency(stats.lifetimeSpend, "INR")}
          loading={ordersQuery.isLoading}
          accent="bg-success/10 text-success"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent orders */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent Orders</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/orders">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {ordersQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-12 w-12" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : ordersQuery.isError ? (
              <ErrorState
                error={ordersQuery.error}
                onRetry={() => ordersQuery.refetch()}
              />
            ) : !ordersQuery.data?.data.length ? (
              <EmptyState
                icon={ShoppingBag}
                title="No orders yet"
                description="When you place your first order, it'll show up here."
                action={
                  <Button asChild variant="gradient" size="sm">
                    <Link href="/products">Browse products</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-2">
                {ordersQuery.data.data.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/orders/${order.id}`}
                      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {order.items[0]?.imageUrl ? (
                          <img
                            src={order.items[0].imageUrl}
                            alt=""
                            className="h-full w-full rounded-lg object-cover"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {order.number}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {order.itemCount}{" "}
                          {order.itemCount === 1 ? "item" : "items"} ·{" "}
                          {formatDate(order.placedAt)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-semibold">
                          {formatCurrency(order.totals.total, order.currency)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            getStatusColor(order.status),
                          )}
                        >
                          {titleCase(order.status)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Notifications preview */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" /> Notifications
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/notifications">
                All <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {notificationsQuery.isLoading ? (
              <LoadingState />
            ) : notificationsQuery.isError ? (
              <ErrorState
                error={notificationsQuery.error}
                onRetry={() => notificationsQuery.refetch()}
              />
            ) : !notificationsQuery.data?.data.length ? (
              <EmptyState
                icon={Bell}
                title="All caught up"
                description="You have no notifications right now."
              />
            ) : (
              <ul className="space-y-3">
                {notificationsQuery.data.data.map((n) => (
                  <li key={n.id} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        n.read ? "bg-muted-foreground/40" : "bg-primary",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {n.title}
                      </p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {n.message}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI assistant quick access */}
      <Card className="overflow-hidden border-primary/20">
        <div className="relative flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl brand-gradient shadow-glow">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold">
                Ask {APP_NAME} AI
                <Badge variant="info" className="text-[10px]" dot>
                  Online
                </Badge>
              </h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Get product recommendations, order updates, and instant
                answers — 24/7. Our AI assistant is here to help.
              </p>
            </div>
          </div>
          <Button asChild variant="gradient" className="shrink-0">
            <Link href={ROUTES.assistant}>
              <Sparkles className="h-4 w-4" /> Open assistant
            </Link>
          </Button>
        </div>
      </Card>

      {/* Recommended products */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Recommended for you
            </h2>
            <p className="text-sm text-muted-foreground">
              AI-picked products based on your preferences and history.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/products?filter=recommended">
              See more <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {recommendationsQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full" />
            ))}
          </div>
        ) : recommendationsQuery.isError ? (
          <ErrorState
            error={recommendationsQuery.error}
            onRetry={() => recommendationsQuery.refetch()}
          />
        ) : !recommendationsQuery.data?.length ? (
          <EmptyState
            icon={Sparkles}
            title="No recommendations yet"
            description="Place an order or browse products to get personalised picks."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {recommendationsQuery.data
              .slice(0, 4)
              .map(({ product }, idx) => (
                <ProductCard key={product.id} product={product} index={idx} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Helpers =====

function computeStats(
  orders: Order[],
  user?: { rewardPoints?: number } | null,
) {
  const total = orders.length;
  const activeStatuses = new Set([
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "in_transit",
    "out_for_delivery",
  ]);
  const active = orders.filter((o) => activeStatuses.has(o.status)).length;
  const lifetime = orders.reduce(
    (sum, o) => sum + (o.paymentStatus === "paid" ? o.totals.total : 0),
    0,
  );
  return {
    totalOrders: total,
    activeOrders: active,
    rewardPoints: user?.rewardPoints ?? 0,
    lifetimeSpend: lifetime,
  };
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  loading: boolean;
  accent: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  accent,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              accent,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">
              {label}
            </p>
            {loading ? (
              <Skeleton className="mt-1 h-5 w-16" />
            ) : (
              <p className="truncate text-lg font-semibold text-foreground">
                {value}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
