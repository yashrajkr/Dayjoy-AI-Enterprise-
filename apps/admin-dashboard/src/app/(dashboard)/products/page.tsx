"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ImageOff,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  ErrorBanner,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  ToastViewport,
  useConfirmDialog,
  useDebounce,
  usePagination,
  useToast,
  type Column,
} from "@/components/features/_shared";
import { productsService } from "@/components/features/_shared";
import type { Product } from "@/components/features/_shared";
import { formatCurrency, formatNumber } from "@/lib/utils";

const STATUS_OPTIONS = [
  { label: "Draft", value: "DRAFT" },
  { label: "Active", value: "ACTIVE" },
  { label: "Out of Stock", value: "OUT_OF_STOCK" },
  { label: "Archived", value: "ARCHIVED" },
];

export default function ProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { page, limit, setPage, setLimit, reset } = usePagination(10);

  const debouncedSearch = useDebounce(search, 300);

  const filterKey = `${debouncedSearch}|${statusFilter}|${categoryFilter}|${minPrice}|${maxPrice}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    reset();
  }

  const { data: categories } = useQuery({
    queryKey: ["products", "categories"],
    queryFn: () => productsService.listCategories(),
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["products", { page, limit, search: debouncedSearch, status: statusFilter, category: categoryFilter, minPrice, maxPrice }],
    queryFn: () =>
      productsService.findAll({
        page,
        limit,
        search: debouncedSearch,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
      }),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: (status: string) => productsService.bulkUpdateStatus(selectedIds, status),
    onSuccess: () => {
      toast.success(`Updated ${selectedIds.length} products.`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedIds([]);
    },
    onError: () => toast.error("Bulk update failed."),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => productsService.bulkDelete(selectedIds),
    onSuccess: () => {
      toast.success(`Deleted ${selectedIds.length} products.`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedIds([]);
    },
    onError: () => toast.error("Bulk delete failed."),
  });

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/[0.04]">
            {row.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.images[0]} alt={row.name} className="h-full w-full object-cover" />
            ) : (
              <ImageOff className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (row) => <span className="text-foreground">{row.categoryName ?? "—"}</span>,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (row) => (
        <div className="text-right">
          <p className="font-medium text-foreground">{formatCurrency(row.price, row.currency)}</p>
          {row.compareAtPrice && (
            <p className="text-xs text-muted-foreground line-through">{formatCurrency(row.compareAtPrice, row.currency)}</p>
          )}
        </div>
      ),
    },
    {
      key: "inventory",
      header: "Inventory",
      align: "right",
      cell: (row) => (
        <div className="text-right">
          <p className="font-mono text-xs text-foreground">
            {row.inventory.available} <span className="text-muted-foreground">/ {row.inventory.quantity}</span>
          </p>
          <p className="text-xs text-muted-foreground">{row.inventory.reserved} reserved</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge value={row.status} dot />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/products/${row.id}`);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <ToastViewport />
      {confirmDialog}
      <PageHeader
        title="Products"
        description="Manage your product catalog, pricing, and inventory."
        icon={Package}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/products/categories")}>
              Categories
            </Button>
            <Button variant="outline" onClick={() => router.push("/products/inventory")}>
              Inventory
            </Button>
            <Button onClick={() => router.push("/products/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name or SKU..."
              className="min-w-[220px] flex-1"
            />
            <FilterSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={(categories ?? []).flatMap((c) => [
                { label: c.name, value: c.name },
                ...(c.children ?? []).map((ch) => ({ label: `— ${ch.name}`, value: ch.name })),
              ])}
              placeholder="All categories"
              ariaLabel="Filter by category"
              className="w-44"
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              placeholder="All statuses"
              ariaLabel="Filter by status"
              className="w-40"
            />
            <Input
              type="number"
              placeholder="Min $"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-24"
            />
            <Input
              type="number"
              placeholder="Max $"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-24"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan/30 bg-cyan/5 p-3">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{selectedIds.length}</span> selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => bulkStatusMutation.mutate("ACTIVE")}>
              Set Active
            </Button>
            <Button variant="outline" size="sm" onClick={() => bulkStatusMutation.mutate("ARCHIVED")}>
              Archive
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                const ok = await confirm({
                  title: `Delete ${selectedIds.length} products?`,
                  description: "This will permanently remove the selected products.",
                  confirmLabel: "Delete",
                  destructive: true,
                });
                if (ok) bulkDeleteMutation.mutate();
              }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {isError && <ErrorBanner message={(error as Error)?.message ?? "Failed to load products"} onRetry={() => refetch()} />}

      <Card>
        <CardContent className="p-0">
          <DataTable<Product>
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            loadingRows={8}
            emptyTitle="No products found"
            emptyDescription="Try adjusting your filters, or add your first product."
            emptyAction={
              <Button onClick={() => router.push("/products/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            }
            onRowClick={(row) => router.push(`/products/${row.id}`)}
            rowKey={(row) => row.id}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            getRowId={(row) => row.id}
          />
          <Pagination
            page={page}
            totalPages={data?.totalPages ?? 1}
            total={data?.total ?? 0}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
