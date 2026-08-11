"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  IndianRupee,
  Package,
  ShoppingCart,
  Sparkles,
  Star,
  Truck,
  Wand2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Separator } from "@/components/ui/separator";
import { productsService, trainingService } from "@/lib/services";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/constants";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [activeImage, setActiveImage] = useState(0);
  const [pitch, setPitch] = useState<{ pitch: string; keyPoints: string[] } | null>(null);

  const { data: product, isLoading, isError, error } = useQuery({
    queryKey: ["product", params.id],
    queryFn: () => productsService.get(params.id),
    enabled: !!params.id,
  });

  const { data: trainings } = useQuery({
    queryKey: ["product-training", product?.trainingModuleIds],
    queryFn: async () => {
      if (!product?.trainingModuleIds?.length) return [];
      const all = await trainingService.list();
      return all.filter((t) => product.trainingModuleIds.includes(t.id));
    },
    enabled: !!product?.trainingModuleIds?.length,
  });

  const pitchMutation = useMutation({
    mutationFn: () => productsService.generatePitch(params.id),
    onSuccess: (data) => {
      setPitch(data);
      toast.success("AI pitch generated.");
    },
    onError: () => toast.error("Failed to generate pitch."),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <InlineAlert variant="error">
        Failed to load product: {(error as Error)?.message ?? "Not found"}.{" "}
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="underline"
        >
          Back to products
        </button>
      </InlineAlert>
    );
  }

  const outOfStock = product.stock === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={product.description}
        icon={Package}
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: product.name },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/products")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              disabled={outOfStock}
              onClick={() =>
                router.push(`/orders/new?productId=${product.id}`)
              }
            >
              <ShoppingCart className="h-4 w-4" />
              Sell this product
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left — images */}
        <Card>
          <CardContent className="p-4">
            <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
              {product.images[activeImage] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.images[activeImage]}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="mt-3 flex gap-2">
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={cn(
                      "h-16 w-16 overflow-hidden rounded-md border-2 transition-colors",
                      i === activeImage
                        ? "border-primary"
                        : "border-border hover:border-primary/40",
                    )}
                    aria-label={`View image ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt={`${product.name} ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right — info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pricing & inventory</CardTitle>
                <Badge variant="secondary">
                  {PRODUCT_CATEGORY_LABELS[product.category]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">MRP</p>
                  <p className="text-xl font-semibold text-foreground">
                    {formatCurrency(product.mrp)}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-3">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Distributor price
                  </p>
                  <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(product.distributorPrice)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Your commission</p>
                  <p className="flex items-center text-lg font-semibold text-foreground">
                    <IndianRupee className="h-4 w-4" />
                    {Math.round(
                      (product.distributorPrice * product.commissionRate) / 100,
                    )}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({product.commissionRate}% per unit)
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Stock</p>
                  <p
                    className={cn(
                      "text-lg font-semibold",
                      outOfStock
                        ? "text-destructive"
                        : "text-foreground",
                    )}
                  >
                    {outOfStock ? "0" : formatNumber(product.stock)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="font-medium text-foreground">
                    {product.rating}
                  </span>
                  <span className="text-muted-foreground">
                    ({formatNumber(product.reviewCount)} reviews)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Truck className="h-3.5 w-3.5" />
                  SKU: {product.sku}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Pitch Generator */}
          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Sales Pitch Generator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Generate a personalized sales script for this product.
              </p>
              <Button
                variant="outline"
                className="w-full"
                loading={pitchMutation.isPending}
                onClick={() => pitchMutation.mutate()}
              >
                <Wand2 className="h-4 w-4" />
                {pitchMutation.isPending
                  ? "Generating…"
                  : pitch
                    ? "Regenerate pitch"
                    : "Generate product pitch"}
              </Button>
              {pitch && (
                <div className="space-y-3 rounded-lg border border-border bg-background p-4">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">
                    {pitch.pitch}
                  </pre>
                  <Separator />
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Key selling points
                    </p>
                    <ul className="space-y-1">
                      {pitch.keyPoints.map((kp, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-foreground"
                        >
                          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                          {kp}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      navigator.clipboard?.writeText(pitch.pitch);
                      toast.success("Pitch copied to clipboard.");
                    }}
                  >
                    Copy pitch
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Long description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {product.longDescription}
          </p>
          <Separator className="my-4" />
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Key features</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {product.features.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Training materials */}
      {trainings && trainings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4 text-primary" />
              Training materials for this product
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {trainings.map((t) => (
                <Link
                  key={t.id}
                  href={`/training/${t.id}`}
                  className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.duration > 0
                        ? `${Math.round(t.duration / 60)} min`
                        : "Document"}{" "}
                      · {t.completed ? "Completed" : "Not started"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
