"use client";

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTicket } from "@/hooks/use-api";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from "@/lib/constants";
import type { CreateTicketInput, SupportTicket } from "@/types";
import { cn } from "@/lib/utils";

const ticketSchema = z.object({
  subject: z
    .string()
    .min(8, "Subject must be at least 8 characters")
    .max(120, "Subject must be 120 characters or less"),
  category: z.string().min(1, "Please select a category"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  description: z
    .string()
    .min(20, "Description must be at least 20 characters")
    .max(4000, "Description must be 4000 characters or less"),
});

type TicketFormValues = z.infer<typeof ticketSchema>;

interface TicketFormProps {
  /** Called when the ticket is successfully created. */
  onSuccess?: (ticket: SupportTicket) => void;
  /** Cancel handler — if omitted, no cancel button is rendered. */
  onCancel?: () => void;
  /** Optional children rendered above the submit button (e.g. file uploads). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Reusable support ticket creation form. Used by both the
 * "New Ticket" page and the support-center quick-create card.
 *
 * Submission calls `POST /api/support/tickets` via `useCreateTicket`.
 * Attachments are accepted as a list of files; the form currently
 * surfaces them in the UI but defers upload to a future API revision
 * (the backend will accept a presigned-URL flow).
 */
export function TicketForm({
  onSuccess,
  onCancel,
  footer,
  className,
}: TicketFormProps) {
  const createTicket = useCreateTicket();
  const [attachments, setAttachments] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TicketFormValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      subject: "",
      category: "",
      priority: "MEDIUM",
      description: "",
    },
  });

  const categoryValue = watch("category");
  const priorityValue = watch("priority");

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => [...prev, ...files].slice(0, 5));
  };

  const onSubmit = async (values: TicketFormValues) => {
    // Convert files to placeholder metadata (real upload is a future API).
    const attachmentMeta = attachments.map((f) => ({
      name: f.name,
      url: `pending://${f.name}`,
    }));

    const payload: CreateTicketInput = {
      ...values,
      attachments: attachmentMeta,
    };

    const ticket = await createTicket.mutateAsync(payload);
    onSuccess?.(ticket);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("space-y-5", className)}
      noValidate
    >
      {/* Subject */}
      <div className="space-y-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          placeholder="Brief summary of your issue"
          {...register("subject")}
          aria-invalid={Boolean(errors.subject)}
        />
        {errors.subject ? (
          <p className="text-xs text-destructive">{errors.subject.message}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Category */}
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Select
            value={categoryValue}
            onValueChange={(v) => setValue("category", v, { shouldValidate: true })}
          >
            <SelectTrigger id="category" aria-invalid={Boolean(errors.category)}>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {TICKET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category ? (
            <p className="text-xs text-destructive">{errors.category.message}</p>
          ) : null}
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <Select
            value={priorityValue}
            onValueChange={(v) =>
              setValue("priority", v as TicketFormValues["priority"], {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={6}
          placeholder="Describe your issue in detail. Include order numbers, dates, or screenshots if relevant."
          {...register("description")}
          aria-invalid={Boolean(errors.description)}
        />
        <div className="flex items-center justify-between text-xs">
          {errors.description ? (
            <p className="text-destructive">{errors.description.message}</p>
          ) : (
            <span className="text-muted-foreground">
              Minimum 20 characters.
            </span>
          )}
          <span className="text-muted-foreground">
            {watch("description")?.length ?? 0}/4000
          </span>
        </div>
      </div>

      {/* Attachments */}
      <div className="space-y-1.5">
        <Label htmlFor="attachments">Attachments (optional, max 5)</Label>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="attachments"
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-accent"
          >
            <Paperclip className="h-4 w-4" />
            Add files
          </label>
          <input
            id="attachments"
            type="file"
            multiple
            className="sr-only"
            onChange={handleFiles}
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          {attachments.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs"
            >
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() =>
                  setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {footer}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={createTicket.isPending}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={createTicket.isPending} className="gap-2">
          {createTicket.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit ticket"
          )}
        </Button>
      </div>
    </form>
  );
}
