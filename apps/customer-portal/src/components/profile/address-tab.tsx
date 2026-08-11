"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Home,
  Briefcase,
  Star,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import type {
  CustomerAddress,
  AddressType,
} from "@/types/customer.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";

const addressSchema = z.object({
  type: z.enum(["shipping", "billing"]),
  label: z.string().optional(),
  fullName: z.string().min(1, "Full name is required"),
  phone: z.string().min(10, "Enter a valid phone number"),
  line1: z.string().min(1, "Address line 1 is required"),
  line2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  postalCode: z.string().min(4, "Enter a valid postal code"),
  country: z.string().min(2, "Country is required"),
  instructions: z.string().optional(),
  isDefault: z.boolean().optional(),
});

type AddressValues = z.infer<typeof addressSchema>;

const LABEL_ICONS: Record<string, typeof Home> = {
  Home,
  Work: Briefcase,
  Office: Briefcase,
};

export function AddressTab({
  customerId,
  addresses,
}: {
  customerId: string;
  addresses: CustomerAddress[];
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${customerId}/addresses/${id}`),
    onSuccess: () => {
      toast.success("Address deleted");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customer });
    },
    onError: (err) =>
      toast.error("Delete failed", { description: getErrorMessage(err) }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: AddressType }) =>
      api.patch(`/customers/${customerId}/addresses/${id}`, {
        isDefault: true,
        type,
      }),
    onSuccess: () => {
      toast.success("Default address updated");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customer });
    },
    onError: (err) =>
      toast.error("Update failed", { description: getErrorMessage(err) }),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Saved Addresses</CardTitle>
        <Button
          variant="gradient"
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add address
        </Button>
      </CardHeader>
      <CardContent>
        {addresses.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No saved addresses"
            description="Add a shipping or billing address to speed up checkout."
            action={
              <Button
                variant="gradient"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add address
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {addresses.map((addr) => {
              const LabelIcon = addr.label
                ? LABEL_ICONS[addr.label] ?? MapPin
                : MapPin;
              return (
                <div
                  key={addr.id}
                  className="relative rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <LabelIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {addr.label ?? addr.type}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {addr.type}
                        </p>
                      </div>
                    </div>
                    {addr.isDefault && (
                      <Badge variant="default" className="text-[10px]">
                        <Star className="h-2.5 w-2.5" /> Default
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {addr.fullName}
                    </p>
                    <p>{addr.line1}</p>
                    {addr.line2 && <p>{addr.line2}</p>}
                    <p>
                      {addr.city}, {addr.state} {addr.postalCode}
                    </p>
                    <p>{addr.country}</p>
                    <p className="mt-1">📞 {addr.phone}</p>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(addr);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    {!addr.isDefault && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDefaultMutation.mutate({
                              id: addr.id,
                              type: addr.type,
                            })
                          }
                        >
                          Set default
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(addr.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AddressDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customerId={customerId}
        editing={editing}
      />
    </Card>
  );
}

function AddressDialog({
  open,
  onOpenChange,
  customerId,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  editing: CustomerAddress | null;
}) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    values: editing
      ? {
          type: editing.type,
          label: editing.label,
          fullName: editing.fullName,
          phone: editing.phone,
          line1: editing.line1,
          line2: editing.line2,
          city: editing.city,
          state: editing.state,
          postalCode: editing.postalCode,
          country: editing.country,
          instructions: editing.instructions,
          isDefault: editing.isDefault,
        }
      : {
          type: "shipping",
          fullName: "",
          phone: "",
          line1: "",
          city: "",
          state: "",
          postalCode: "",
          country: "India",
        },
  });

  const type = watch("type");

  const saveMutation = useMutation({
    mutationFn: (values: AddressValues) =>
      editing
        ? api.put(
            `/customers/${customerId}/addresses/${editing.id}`,
            values,
          )
        : api.post(`/customers/${customerId}/addresses`, values),
    onSuccess: () => {
      toast.success(editing ? "Address updated" : "Address added");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customer });
      onOpenChange(false);
      reset();
    },
    onError: (err) =>
      toast.error("Save failed", { description: getErrorMessage(err) }),
  });

  const onSubmit = (values: AddressValues) => saveMutation.mutateAsync(values);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className="sr-only">Open</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit address" : "Add new address"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the details for this saved address."
              : "Save a shipping or billing address for faster checkout."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setValue("type", v as AddressType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shipping">Shipping</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="label">Label (optional)</Label>
            <Input id="label" placeholder="Home, Work, etc." {...register("label")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" {...register("fullName")} />
            {errors.fullName && (
              <p className="text-xs text-destructive">
                {errors.fullName.message}
              </p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" {...register("phone")} />
            {errors.phone && (
              <p className="text-xs text-destructive">
                {errors.phone.message}
              </p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="line1">Address line 1</Label>
            <Input id="line1" placeholder="House no, street" {...register("line1")} />
            {errors.line1 && (
              <p className="text-xs text-destructive">
                {errors.line1.message}
              </p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="line2">Address line 2 (optional)</Label>
            <Input id="line2" placeholder="Apartment, suite" {...register("line2")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" {...register("city")} />
            {errors.city && (
              <p className="text-xs text-destructive">
                {errors.city.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input id="state" {...register("state")} />
            {errors.state && (
              <p className="text-xs text-destructive">
                {errors.state.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">Postal code</Label>
            <Input id="postalCode" {...register("postalCode")} />
            {errors.postalCode && (
              <p className="text-xs text-destructive">
                {errors.postalCode.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input id="country" {...register("country")} />
            {errors.country && (
              <p className="text-xs text-destructive">
                {errors.country.message}
              </p>
            )}
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="gradient" loading={isSubmitting}>
              {editing ? "Save changes" : "Add address"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
