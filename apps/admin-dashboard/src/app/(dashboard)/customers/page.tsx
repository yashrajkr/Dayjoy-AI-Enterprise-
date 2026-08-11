"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DataTable,
  ErrorBanner,
  FilterSelect,
  FormDialog,
  Pagination,
  SearchInput,
  StatusBadge,
  TagList,
  ToastViewport,
  useDebounce,
  usePagination,
  useToast,
  type Column,
} from "@/components/features/_shared";
import { customersService } from "@/components/features/_shared";
import type { Customer, CustomerStatus, CustomerType } from "@/components/features/_shared";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

const TYPE_OPTIONS: Array<{ label: string; value: CustomerType }> = [
  { label: "Individual", value: "INDIVIDUAL" },
  { label: "Business", value: "BUSINESS" },
];

const STATUS_OPTIONS: Array<{ label: string; value: CustomerStatus }> = [
  { label: "Active", value: "ACTIVE" },
  { label: "Prospect", value: "PROSPECT" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Blocked", value: "BLOCKED" },
];

export default function CustomersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { page, limit, setPage, setLimit, reset } = usePagination(10);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", type: "INDIVIDUAL", status: "ACTIVE", company: "" });

  const debouncedSearch = useDebounce(search, 300);

  const filterKey = `${debouncedSearch}|${typeFilter}|${statusFilter}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    reset();
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["customers", { page, limit, search: debouncedSearch, type: typeFilter, status: statusFilter }],
    queryFn: () =>
      customersService.findAll({
        page,
        limit,
        search: debouncedSearch,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      customersService.create({
        name: form.name,
        email: form.email,
        phone: form.phone,
        type: form.type as CustomerType,
        status: form.status as CustomerStatus,
        company: form.company || null,
      }),
    onSuccess: (customer) => {
      toast.success("Customer created.");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setCreateOpen(false);
      router.push(`/customers/${customer.id}`);
    },
    onError: () => toast.error("Could not create customer."),
  });

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          {row.company && <p className="truncate text-xs text-muted-foreground">{row.company}</p>}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">{row.email}</p>
          <p className="truncate text-xs text-muted-foreground">{row.phone}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (row) => <StatusBadge value={row.type} toneMap={{ INDIVIDUAL: "info", BUSINESS: "default" }} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge value={row.status} dot />,
    },
    {
      key: "ltv",
      header: "LTV",
      align: "right",
      cell: (row) => <span className="font-medium text-foreground">{formatCurrency(row.lifetimeValue, "USD")}</span>,
    },
    {
      key: "orders",
      header: "Orders",
      align: "right",
      cell: (row) => <span className="font-mono text-xs">{formatNumber(row.totalOrders)}</span>,
    },
    {
      key: "lastOrder",
      header: "Last Order",
      cell: (row) => <span className="text-xs text-muted-foreground">{row.lastOrderAt ? formatDate(row.lastOrderAt) : "—"}</span>,
    },
    {
      key: "tags",
      header: "Tags",
      cell: (row) => <TagList tags={row.tags} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: () => <Button variant="ghost" size="sm">View</Button>,
    },
  ];

  return (
    <div className="space-y-6">
      <ToastViewport />
      <PageHeader
        title="Customers"
        description="Manage customer relationships and history."
        icon={Users}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name, email, phone..."
              className="min-w-[220px] flex-1"
            />
            <FilterSelect
              value={typeFilter}
              onChange={setTypeFilter}
              options={TYPE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
              placeholder="All types"
              ariaLabel="Filter by type"
              className="w-40"
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
              placeholder="All statuses"
              ariaLabel="Filter by status"
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {isError && <ErrorBanner message={(error as Error)?.message ?? "Failed to load customers"} onRetry={() => refetch()} />}

      <Card>
        <CardContent className="p-0">
          <DataTable<Customer>
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            loadingRows={8}
            emptyTitle="No customers found"
            emptyDescription="Try adjusting your filters, or add your first customer."
            emptyAction={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
            }
            onRowClick={(row) => router.push(`/customers/${row.id}`)}
            rowKey={(row) => row.id}
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

      {/* Create Dialog */}
      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add Customer"
        description="Create a new customer record. You can fill in additional details later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.email || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Customer"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="c-name">Name *</Label>
            <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-email">Email *</Label>
              <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-type">Type</Label>
              <select
                id="c-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-white/[0.03] px-3 text-sm text-foreground"
              >
                <option value="INDIVIDUAL" className="bg-card">Individual</option>
                <option value="BUSINESS" className="bg-card">Business</option>
              </select>
            </div>
            <div>
              <Label htmlFor="c-status">Status</Label>
              <select
                id="c-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-white/[0.03] px-3 text-sm text-foreground"
              >
                <option value="ACTIVE" className="bg-card">Active</option>
                <option value="PROSPECT" className="bg-card">Prospect</option>
                <option value="INACTIVE" className="bg-card">Inactive</option>
                <option value="BLOCKED" className="bg-card">Blocked</option>
              </select>
            </div>
          </div>
          {form.type === "BUSINESS" && (
            <div>
              <Label htmlFor="c-company">Company</Label>
              <Input id="c-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="mt-1.5" />
            </div>
          )}
        </div>
      </FormDialog>
    </div>
  );
}
