"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, X } from "lucide-react";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useDebounce } from "@/hooks/use-debounce";
import type {
  Product,
  ProductCategory,
  ProductSortOption,
} from "@/types/product.types";
import { PageHeader } from "@/components/shared/page-header";
import { ProductCard } from "@/components/products/product-card";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORT_OPTIONS: Array<{ value: ProductSortOption; label: string }> = [
  { value: "popularity", label: "Most relevant" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Top rated" },
];

export default function ProductSearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ProductSearchInner />
    </Suspense>
  );
}

function ProductSearchInner() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 350);
  const [sort, setSort] = useState<ProductSortOption>("popularity");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  const categoriesQuery = useQuery({
    queryKey: QUERY_KEYS.productCategories,
    queryFn: () => api.get<ProductCategory[]>("/products/categories"),
    staleTime: 10 * 60 * 1000,
  });

  const searchParams2 = {
    search: debouncedQuery || undefined,
    category: selectedCategories.length ? selectedCategories : undefined,
    minRating: minRating || undefined,
    maxPrice: maxPrice ?? undefined,
    sort,
    limit: 24,
  };

  const resultsQuery = useQuery({
    queryKey: [...QUERY_KEYS.productSearch, searchParams2],
    queryFn: () => api.paginated<Product>("/products/search", searchParams2),
    enabled: debouncedQuery.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 30 * 1000,
  });

  const toggleCategory = (id: string) =>
    setSelectedCategories((prev) =>
      prev.includes(id)
        ? prev.filter((c) => c !== id)
        : [...prev, id],
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search Products"
        description="Find exactly what you're looking for across the Dayjoy catalogue."
        actions={
          <Select value={sort} onValueChange={(v) => setSort(v as ProductSortOption)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Search bar */}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, brand, keyword…"
          className="h-12 pl-10 text-base"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Faceted filters */}
        <aside className="w-full shrink-0 lg:w-64">
          <Card className="sticky top-20">
            <CardContent className="space-y-6 p-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Categories
                </h3>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {categoriesQuery.isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-5 w-full" />
                      ))}
                    </div>
                  ) : (
                    categoriesQuery.data?.map((cat) => (
                      <label
                        key={cat.id}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <Checkbox
                          checked={selectedCategories.includes(cat.id)}
                          onCheckedChange={() => toggleCategory(cat.id)}
                        />
                        <span className="flex-1 truncate">{cat.name}</span>
                        {cat.productCount != null && (
                          <span className="text-xs text-muted-foreground">
                            {cat.productCount}
                          </span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Minimum rating
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {[0, 3, 4, 4.5].map((r) => (
                    <button
                      key={r}
                      onClick={() => setMinRating(r)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        minRating === r
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {r === 0 ? "Any" : `${r}★+`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Max price
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {[null, 500, 1000, 5000, 10000].map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setMaxPrice(p)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        maxPrice === p
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {p === null ? "Any" : `≤ ₹${p.toLocaleString("en-IN")}`}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          {!debouncedQuery ? (
            <EmptyState
              icon={SearchIcon}
              title="Start your search"
              description="Type above to find products across the Dayjoy catalogue."
            />
          ) : resultsQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full" />
              ))}
            </div>
          ) : resultsQuery.isError ? (
            <ErrorState
              error={resultsQuery.error}
              onRetry={() => resultsQuery.refetch()}
            />
          ) : !resultsQuery.data?.data.length ? (
            <EmptyState
              icon={SearchIcon}
              title={`No results for "${debouncedQuery}"`}
              description="Try different keywords or remove some filters."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setSelectedCategories([]);
                    setMinRating(0);
                    setMaxPrice(null);
                  }}
                >
                  Clear all
                </Button>
              }
            />
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                Found{" "}
                <span className="font-medium text-foreground">
                  {resultsQuery.data.meta.total}
                </span>{" "}
                results for{" "}
                <span className="font-medium text-foreground">
                  &quot;{debouncedQuery}&quot;
                </span>
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {resultsQuery.data.data.map((product, idx) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={idx}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
