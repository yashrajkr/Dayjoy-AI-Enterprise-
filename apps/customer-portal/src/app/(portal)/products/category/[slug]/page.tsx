"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Package } from "lucide-react";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import type { Product, ProductCategory } from "@/types/product.types";
import { PageHeader } from "@/components/shared/page-header";
import { ProductCard } from "@/components/products/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProductCategoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const categoryQuery = useQuery({
    queryKey: [...QUERY_KEYS.productCategories, slug],
    queryFn: () => api.get<ProductCategory>(`/products/categories/${slug}`),
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
  });

  const productsQuery = useQuery({
    queryKey: [...QUERY_KEYS.products, { categorySlug: slug }],
    queryFn: () =>
      api.paginated<Product>("/products", {
        categorySlug: slug,
        limit: 24,
        sort: "popularity",
      }),
    enabled: !!slug,
    staleTime: 60 * 1000,
  });

  const categoryName = categoryQuery.data?.name ?? slug;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/products" className="hover:text-foreground">
          Products
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{categoryName}</span>
      </nav>

      <PageHeader
        title={categoryName}
        description={
          categoryQuery.data?.description ??
          `Browse all products in the ${categoryName} category.`
        }
      />

      {productsQuery.isLoading ? (
        <LoadingState label="Loading products…" />
      ) : productsQuery.isError ? (
        <ErrorState
          error={productsQuery.error}
          onRetry={() => productsQuery.refetch()}
        />
      ) : !productsQuery.data?.data.length ? (
        <EmptyState
          icon={Package}
          title="No products in this category yet"
          description="Check back soon — we're constantly adding new products."
          action={
            <Link
              href="/products"
              className="text-sm font-medium text-primary hover:underline"
            >
              Browse all products
            </Link>
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {productsQuery.data.meta.total}
            </span>{" "}
            products
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {productsQuery.data.data.map((product, idx) => (
              <ProductCard key={product.id} product={product} index={idx} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
