"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Star, ShoppingCart, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCart } from "@/hooks/use-cart";
import { cn, formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/product.types";

interface ProductCardProps {
  product: Product;
  index?: number;
}

const AVAILABILITY_BADGE: Record<
  Product["availability"],
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  in_stock: { label: "In stock", variant: "success" },
  low_stock: { label: "Low stock", variant: "warning" },
  out_of_stock: { label: "Out of stock", variant: "destructive" },
  preorder: { label: "Pre-order", variant: "secondary" },
};

/**
 * ProductCard — grid cell for the product list / search / category
 * pages. Shows image, name, price, rating, availability, and an
 * add-to-cart button (disabled when out of stock).
 */
export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const { addItem } = useCart();

  const availability = AVAILABILITY_BADGE[product.availability];
  const outOfStock = product.availability === "out_of_stock";
  const onSale =
    product.pricing.listPrice > product.pricing.salePrice;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      imageUrl: product.images[0]?.url,
      sku: product.sku,
      unitPrice: product.pricing.salePrice,
      currency: product.currency,
      maxStock: product.stockQuantity,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
    >
      <Card
        className={cn(
          "group relative flex h-full flex-col overflow-hidden p-0 transition-shadow hover:shadow-card-hover",
        )}
      >
        <Link
          href={`/products/${product.slug}`}
          className="relative block aspect-square overflow-hidden bg-muted"
        >
          {product.images[0]?.url ? (
            <img
              src={product.images[0].url}
              alt={product.images[0]?.altText ?? product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40">
              <ShoppingCart className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}

          {/* Top-left badges */}
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {product.isNew && (
              <Badge variant="default" className="text-[10px]">
                NEW
              </Badge>
            )}
            {onSale && (
              <Badge variant="destructive" className="text-[10px]">
                -{product.pricing.discountPercent ?? Math.round(
                  ((product.pricing.listPrice - product.pricing.salePrice) /
                    product.pricing.listPrice) *
                    100,
                )}
                %
              </Badge>
            )}
            {product.isRecommended && (
              <Badge variant="info" className="text-[10px]">
                AI Pick
              </Badge>
            )}
          </div>

          {/* Hover quick view */}
          <div className="absolute inset-0 flex items-end justify-center bg-black/0 p-3 opacity-0 transition-all group-hover:bg-black/5 group-hover:opacity-100">
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 shadow-card"
              asChild
            >
              <Link href={`/products/${product.slug}`}>
                <Eye className="h-3.5 w-3.5" /> Quick view
              </Link>
            </Button>
          </div>
        </Link>

        <div className="flex flex-1 flex-col p-3">
          {product.brand && (
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {product.brand}
            </span>
          )}
          <Link
            href={`/products/${product.slug}`}
            className="line-clamp-2 text-sm font-medium text-foreground hover:text-primary"
          >
            {product.name}
          </Link>

          {/* Rating */}
          {product.rating != null && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-warning text-warning" />
              <span className="font-medium text-foreground">
                {product.rating.toFixed(1)}
              </span>
              {product.reviewCount != null && (
                <span>({product.reviewCount})</span>
              )}
            </div>
          )}

          {/* Price */}
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-base font-semibold text-foreground">
              {formatCurrency(product.pricing.salePrice, product.currency)}
            </span>
            {onSale && (
              <span className="text-xs text-muted-foreground line-through">
                {formatCurrency(product.pricing.listPrice, product.currency)}
              </span>
            )}
          </div>

          {/* Footer */}
          <div className="mt-auto flex items-center justify-between pt-3">
            <Badge variant={availability.variant} className="text-[10px]">
              {availability.label}
            </Badge>
            <Button
              size="sm"
              variant={outOfStock ? "secondary" : "gradient"}
              disabled={outOfStock}
              onClick={handleAddToCart}
              className="gap-1.5"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
