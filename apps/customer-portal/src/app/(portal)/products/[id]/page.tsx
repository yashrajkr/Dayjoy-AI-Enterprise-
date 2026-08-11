"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Minus,
  Plus,
  ShoppingCart,
  Star,
  Truck,
  Shield,
  RefreshCcw,
  Bot,
  ChevronRight,
  Check,
  MessageSquare,
} from "lucide-react";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useCart } from "@/hooks/use-cart";
import {
  cn,
  formatCurrency,
  formatDate,
} from "@/lib/utils";
import type { ProductDetail } from "@/types/product.types";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/shared/states";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCard } from "@/components/products/product-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AIChatWidget } from "@/components/products/ai-chat-widget";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  const productQuery = useQuery({
    queryKey: QUERY_KEYS.product(id),
    queryFn: () => api.get<ProductDetail>(`/products/${id}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  if (productQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (productQuery.isError || !productQuery.data) {
    return (
      <ErrorState
        error={productQuery.error}
        title="Product not found"
        description="This product may have been removed or is temporarily unavailable."
      />
    );
  }

  const product = productQuery.data;
  const onSale = product.pricing.listPrice > product.pricing.salePrice;
  const outOfStock = product.availability === "out_of_stock";

  const handleAddToCart = () => {
    if (outOfStock) return;
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        imageUrl: product.images[0]?.url,
        sku: product.sku,
        unitPrice: product.pricing.salePrice,
        currency: product.currency,
        maxStock: product.stockQuantity,
      },
      quantity,
    );
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumbs */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/products" className="hover:text-foreground">
          Products
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {product.categorySlug && (
          <>
            <Link
              href={`/products/category/${product.categorySlug}`}
              className="hover:text-foreground"
            >
              {product.categoryName}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
          </>
        )}
        <span className="truncate font-medium text-foreground">
          {product.name}
        </span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Image gallery */}
        <div className="space-y-3">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted"
          >
            {product.images[activeImage]?.url ? (
              <img
                src={product.images[activeImage].url}
                alt={product.images[activeImage]?.altText ?? product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ShoppingCart className="h-12 w-12 text-muted-foreground/30" />
              </div>
            )}
            <div className="absolute left-3 top-3 flex flex-col gap-1.5">
              {product.isNew && (
                <Badge variant="default">NEW</Badge>
              )}
              {onSale && (
                <Badge variant="destructive">
                  -{product.pricing.discountPercent ?? Math.round(
                    ((product.pricing.listPrice - product.pricing.salePrice) /
                      product.pricing.listPrice) *
                      100,
                  )}
                  % OFF
                </Badge>
              )}
              {product.isRecommended && (
                <Badge variant="info">
                  <Bot className="h-3 w-3" /> AI Pick
                </Badge>
              )}
            </div>
          </motion.div>

          {product.images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {product.images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImage(idx)}
                  className={cn(
                    "aspect-square overflow-hidden rounded-lg border-2 transition-colors",
                    activeImage === idx
                      ? "border-primary"
                      : "border-border hover:border-primary/50",
                  )}
                  aria-label={`View image ${idx + 1}`}
                >
                  <img
                    src={img.url}
                    alt={img.altText ?? ""}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="space-y-5">
          {product.brand && (
            <span className="text-sm font-medium uppercase tracking-wide text-primary">
              {product.brand}
            </span>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {product.name}
          </h1>

          {/* Rating */}
          {product.rating != null && (
            <div className="flex items-center gap-2">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-4 w-4",
                      i < Math.round(product.rating!)
                        ? "fill-warning text-warning"
                        : "text-muted-foreground/30",
                    )}
                  />
                ))}
              </div>
              <span className="text-sm font-medium">{product.rating.toFixed(1)}</span>
              {product.reviewCount != null && (
                <span className="text-sm text-muted-foreground">
                  ({product.reviewCount} reviews)
                </span>
              )}
            </div>
          )}

          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {formatCurrency(product.pricing.salePrice, product.currency)}
            </span>
            {onSale && (
              <>
                <span className="text-lg text-muted-foreground line-through">
                  {formatCurrency(product.pricing.listPrice, product.currency)}
                </span>
                <Badge variant="destructive">
                  Save{" "}
                  {formatCurrency(
                    product.pricing.listPrice - product.pricing.salePrice,
                    product.currency,
                  )}
                </Badge>
              </>
            )}
          </div>

          {product.shortDescription && (
            <p className="text-sm text-muted-foreground">
              {product.shortDescription}
            </p>
          )}

          {/* Availability */}
          <div className="flex items-center gap-2">
            <Badge
              variant={
                product.availability === "in_stock"
                  ? "success"
                  : product.availability === "out_of_stock"
                    ? "destructive"
                    : "warning"
              }
              dot
            >
              {product.availability === "in_stock" && "In stock"}
              {product.availability === "low_stock" &&
                `Only ${product.stockQuantity ?? "a few"} left`}
              {product.availability === "out_of_stock" && "Out of stock"}
              {product.availability === "preorder" && "Available for pre-order"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              SKU: {product.sku}
            </span>
          </div>

          <Separator />

          {/* Quantity + add to cart */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-sm font-medium">
                {quantity}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() =>
                  setQuantity((q) =>
                    Math.min(q + 1, product.stockQuantity ?? 99),
                  )
                }
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="gradient"
              size="lg"
              className="flex-1"
              disabled={outOfStock}
              onClick={handleAddToCart}
            >
              <ShoppingCart className="h-4 w-4" />
              {outOfStock ? "Out of stock" : "Add to cart"}
            </Button>
          </div>

          {/* Ask AI */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setAiChatOpen(true)}
          >
            <Bot className="h-4 w-4 text-primary" /> Ask AI about this product
          </Button>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { icon: Truck, label: "Free shipping", sub: "Over ₹1,000" },
              { icon: RefreshCcw, label: "7-day returns", sub: "Easy & free" },
              { icon: Shield, label: "Warranty", sub: "Brand covered" },
            ].map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1 rounded-lg border border-border p-3 text-center"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">{label}</span>
                <span className="text-[10px] text-muted-foreground">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs: description, specs, reviews, AI summary */}
      <Tabs defaultValue="description" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="description">Description</TabsTrigger>
          <TabsTrigger value="specs">Specifications</TabsTrigger>
          <TabsTrigger value="reviews">
            Reviews ({product.reviewCount ?? 0})
          </TabsTrigger>
          {product.aiSummary && (
            <TabsTrigger value="ai">AI Insights</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="description">
          <Card>
            <CardContent className="prose prose-sm max-w-none p-6 text-muted-foreground">
              <p className="whitespace-pre-line">
                {product.description ?? product.shortDescription ?? "No description available."}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specs">
          <Card>
            <CardContent className="p-6">
              {product.specifications?.length ? (
                <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  {product.specifications.map((spec, i) => (
                    <div
                      key={i}
                      className="flex justify-between border-b border-border py-2"
                    >
                      <dt className="text-sm text-muted-foreground">
                        {spec.label}
                      </dt>
                      <dd className="text-sm font-medium text-foreground">
                        {spec.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No specifications available.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card>
            <CardContent className="space-y-4 p-6">
              {product.reviewSummary && (
                <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/40 p-6 sm:flex-row sm:gap-8">
                  <div className="text-center">
                    <p className="text-4xl font-bold">
                      {product.reviewSummary.averageRating.toFixed(1)}
                    </p>
                    <div className="flex justify-center">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "h-4 w-4",
                            i < Math.round(product.reviewSummary!.averageRating)
                              ? "fill-warning text-warning"
                              : "text-muted-foreground/30",
                          )}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {product.reviewSummary.totalReviews} reviews
                    </p>
                  </div>
                </div>
              )}

              {product.reviews?.length ? (
                <ul className="space-y-4">
                  {product.reviews.map((review) => (
                    <li
                      key={review.id}
                      className="border-b border-border pb-4 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                            {review.authorName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">
                            {review.authorName}
                            {review.verifiedPurchase && (
                              <Badge variant="success" className="ml-2 text-[10px]">
                                <Check className="h-2.5 w-2.5" /> Verified
                              </Badge>
                            )}
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="flex">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={cn(
                                    "h-3 w-3",
                                    i < review.rating
                                      ? "fill-warning text-warning"
                                      : "text-muted-foreground/30",
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(review.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {review.title && (
                        <p className="mt-2 text-sm font-medium">{review.title}</p>
                      )}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {review.comment}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  title="No reviews yet"
                  description="Be the first to share your experience with this product."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {product.aiSummary && (
          <TabsContent value="ai">
            <Card className="border-primary/20">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Dayjoy AI Summary</p>
                    <p className="text-xs text-muted-foreground">
                      Generated from product data and customer reviews.
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {product.aiSummary}
                </p>

                {product.aiFaqs?.length ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Frequently asked
                    </p>
                    {product.aiFaqs.map((faq, i) => (
                      <div key={i} className="rounded-lg bg-muted/40 p-3">
                        <p className="text-sm font-medium text-foreground">
                          Q: {faq.question}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {faq.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Related products */}
      {product.relatedProducts?.length ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">You might also like</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {product.relatedProducts.slice(0, 4).map((p, idx) => (
              <ProductCard key={p.id} product={p} index={idx} />
            ))}
          </div>
        </div>
      ) : null}

      {/* AI chat dialog */}
      <Dialog open={aiChatOpen} onOpenChange={setAiChatOpen}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" /> Ask about {product.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Chat with the Dayjoy AI assistant about this product.
            </DialogDescription>
          </DialogHeader>
          <AIChatWidget
            productId={product.id}
            productName={product.name}
            onClose={() => setAiChatOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
