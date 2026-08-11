"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  SlidersHorizontal,
  Search as SearchIcon,
  X,
  Package,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useDebounce } from "@/hooks/use-debounce";
import { cn, titleCase } from "@/lib/utils";
import type {
  Product,
  ProductCategory,
  ProductSortOption,
  ProductAvailability,
} from "@/types/product.types";
import { PageHeader } from "@/components/shared/page-header";
import { ProductCard } from "@/components/products/product-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const SORT_OPTIONS: Array<{ value: ProductSortOption; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "popularity", label: "Most popular" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Top rated" },
];

const AVAILABILITY_FILTERS: Array<{
  value: ProductAvailability;
  label: string;
}> = [
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "preorder", label: "Pre-order" },
];

const PRICE_BOUND = [0, 100000] as const;

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialSearch = searchParams.get("q") ?? "";
  const initialFilter = searchParams.get("filter") ?? "";
  const initialCategory = searchParams.get("category") ?? "";

  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebounce(search, 350);

  const [sort, setSort] = useState<ProductSortOption>("newest");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedAvailability, setSelectedAvailability] = useState<
    ProductAvailability[]
  >([]);
  const [priceRange, setPriceRange] = useState<number[]>([...PRICE_BOUND]);
  const [minRating, setMinRating] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 12;

  // Reset page when filters change
  useMemo(() => setPage(1), [
    debouncedSearch,
    sort,
    selectedBrands,
    selectedAvailability,
    priceRange,
    minRating,
    initialFilter,
    initialCategory,
  ]);

  const categoriesQuery = useQuery({
    queryKey: QUERY_KEYS.productCategories,
    queryFn: () => api.get<ProductCategory[]>("/products/categories"),
    staleTime: 10 * 60 * 1000,
  });

  const queryParams = {
    search: debouncedSearch || undefined,
    category: initialCategory || undefined,
    filter: (initialFilter || undefined) as
      | "recommended"
      | "featured"
      | "new"
      | undefined,
    brand: selectedBrands.length ? selectedBrands : undefined,
    availability: selectedAvailability.length
      ? selectedAvailability
      : undefined,
    minPrice: priceRange[0] !== PRICE_BOUND[0] ? priceRange[0] : undefined,
    maxPrice: priceRange[1] !== PRICE_BOUND[1] ? priceRange[1] : undefined,
    minRating: minRating || undefined,
    sort,
    page,
    limit,
  };

  const productsQuery = useQuery({
    queryKey: [...QUERY_KEYS.products, queryParams],
    queryFn: () => api.paginated<Product>("/products", queryParams),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
  });

  // Derive available brands from a categories request or a separate call.
  // Here we keep it simple and derive from fetched products when available.
  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    productsQuery.data?.data.forEach((p) => p.brand && set.add(p.brand));
    return Array.from(set).sort();
  }, [productsQuery.data]);

  const toggleBrand = (brand: string) =>
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand],
    );

  const toggleAvailability = (a: ProductAvailability) =>
    setSelectedAvailability((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );

  const clearFilters = () => {
    setSelectedBrands([]);
    setSelectedAvailability([]);
    setPriceRange([...PRICE_BOUND]);
    setMinRating(0);
    setSearch("");
  };

  const activeFilterCount =
    selectedBrands.length +
    selectedAvailability.length +
    (priceRange[0] !== PRICE_BOUND[0] || priceRange[1] !== PRICE_BOUND[1]
      ? 1
      : 0) +
    (minRating > 0 ? 1 : 0);

  const FilterPanel = (
    <div className="space-y-6">
      {/* Categories */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Categories
        </h3>
        <div className="space-y-1">
          <button
            onClick={() => router.push("/products")}
            className={cn(
              "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
              !initialCategory && "bg-accent font-medium text-foreground",
            )}
          >
            All categories
          </button>
          {categoriesQuery.isLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            categoriesQuery.data?.map((cat) => (
              <button
                key={cat.id}
                onClick={() => router.push(`/products/category/${cat.slug}`)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  initialCategory === cat.slug &&
                    "bg-accent font-medium text-foreground",
                )}
              >
                <span className="truncate">{cat.name}</span>
                {cat.productCount != null && (
                  <span className="text-xs text-muted-foreground">
                    {cat.productCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Price range */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Price range
        </h3>
        <Slider
          value={priceRange}
          onValueChange={setPriceRange}
          min={PRICE_BOUND[0]}
          max={PRICE_BOUND[1]}
          step={500}
          className="mt-2"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>₹{priceRange[0].toLocaleString("en-IN")}</span>
          <span>₹{priceRange[1].toLocaleString("en-IN")}</span>
        </div>
      </div>

      {/* Availability */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Availability
        </h3>
        <div className="space-y-2">
          {AVAILABILITY_FILTERS.map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <Checkbox
                checked={selectedAvailability.includes(value)}
                onCheckedChange={() => toggleAvailability(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Brands */}
      {availableBrands.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Brands
          </h3>
          <div className="max-h-40 space-y-2 overflow-y-auto">
            {availableBrands.map((brand) => (
              <label
                key={brand}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <Checkbox
                  checked={selectedBrands.includes(brand)}
                  onCheckedChange={() => toggleBrand(brand)}
                />
                {brand}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Minimum rating
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {[0, 3, 3.5, 4, 4.5].map((r) => (
            <button
              key={r}
              onClick={() => setMinRating(r)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                minRating === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {r === 0 ? "Any" : `${r}★+`}
            </button>
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={clearFilters}
        >
          <X className="h-3.5 w-3.5" /> Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          initialFilter === "recommended"
            ? "AI Recommendations"
            : initialCategory
              ? titleCase(initialCategory)
              : "All Products"
        }
        description={
          initialFilter === "recommended"
            ? "Personalised picks from the Dayjoy AI based on your activity."
            : "Browse our full catalogue. Filter, sort, and add to cart."
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-56 pl-9"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as ProductSortOption)}>
              <SelectTrigger className="w-40">
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
            <Button
              variant="outline"
              size="default"
              className="lg:hidden"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <Badge variant="default" className="ml-1 text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </div>
        }
      />

      {/* Mobile search */}
      <div className="relative sm:hidden">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="pl-9"
        />
      </div>

      <div className="flex gap-6">
        {/* Desktop filter sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <Card className="sticky top-20">
            <CardContent className="p-4">{FilterPanel}</CardContent>
          </Card>
        </aside>

        {/* Product grid */}
        <div className="min-w-0 flex-1">
          {productsQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full" />
              ))}
            </div>
          ) : productsQuery.isError ? (
            <ErrorState
              error={productsQuery.error}
              onRetry={() => productsQuery.refetch()}
            />
          ) : !productsQuery.data?.data.length ? (
            <EmptyState
              icon={search || activeFilterCount ? SearchIcon : Package}
              title={
                search || activeFilterCount
                  ? "No matching products"
                  : "No products available"
              }
              description={
                search || activeFilterCount
                  ? "Try adjusting your search or filters."
                  : "Check back soon — we're restocking."
              }
              action={
                activeFilterCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing{" "}
                  <span className="font-medium text-foreground">
                    {productsQuery.data.data.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-foreground">
                    {productsQuery.data.meta.total}
                  </span>{" "}
                  products
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {productsQuery.data.data.map((product, idx) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={idx}
                  />
                ))}
              </div>

              {/* Pagination */}
              {productsQuery.data.meta.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  {Array.from(
                    { length: productsQuery.data.meta.totalPages },
                    (_, i) => i + 1,
                  )
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === productsQuery.data!.meta.totalPages ||
                        Math.abs(p - page) <= 1,
                    )
                    .map((p, i, arr) => (
                      <span key={p} className="flex items-center">
                        {i > 0 && arr[i - 1] !== p - 1 && (
                          <span className="px-1 text-muted-foreground">…</span>
                        )}
                        <Button
                          variant={page === p ? "gradient" : "outline"}
                          size="sm"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      </span>
                    ))}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= productsQuery.data.meta.totalPages}
                    onClick={() =>
                      setPage((p) =>
                        Math.min(productsQuery.data!.meta.totalPages, p + 1),
                      )
                    }
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Refine the product list by category, price, and more.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">{FilterPanel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
