"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useTasks } from "@/hooks/use-tasks";
import { useEmployee } from "@/hooks/use-employee";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/constants";
import type {
  RelatedEntityType,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@/types/task.types";

const taskSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).default("TODO"),
  type: z.enum([
    "FOLLOW_UP",
    "CALL",
    "EMAIL",
    "MEETING",
    "DOCUMENT",
    "REVIEW",
    "ADMIN",
    "OTHER",
  ]),
  dueDate: z.string().optional(),
  assignedToId: z.string().min(1, "Pick an assignee"),
  relatedEntityType: z.enum([
    "NONE",
    "CUSTOMER",
    "DISTRIBUTOR",
    "LEAD",
    "TICKET",
    "ORDER",
    "PRODUCT",
  ]),
  relatedEntityId: z.string().optional(),
  relatedEntityLabel: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const TYPES: TaskType[] = [
  "FOLLOW_UP",
  "CALL",
  "EMAIL",
  "MEETING",
  "DOCUMENT",
  "REVIEW",
  "ADMIN",
  "OTHER",
];
const RELATED_TYPES: RelatedEntityType[] = [
  "NONE",
  "CUSTOMER",
  "DISTRIBUTOR",
  "LEAD",
  "TICKET",
  "ORDER",
  "PRODUCT",
];

// Mock teammates — would come from `GET /api/employees?department=...`
const TEAMMATES = [
  { id: "self", name: "Me" },
  { id: "u_001", name: "Priya Sharma (Manager)" },
  { id: "u_002", name: "Rahul Verma (Sales)" },
  { id: "u_003", name: "Sneha Iyer (Support)" },
  { id: "u_004", name: "Amit Singh (Ops)" },
];

export default function NewTaskPage() {
  const router = useRouter();
  const { employee } = useEmployee();
  const { createTask, isCreating } = useTasks();

  const today = new Date().toISOString().slice(0, 10);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "MEDIUM",
      status: "TODO",
      type: "FOLLOW_UP",
      dueDate: today,
      assignedToId: "self",
      relatedEntityType: "NONE",
      relatedEntityId: "",
      relatedEntityLabel: "",
    },
  });

  const relatedEntityType = watch("relatedEntityType");

  const onSubmit = async (values: TaskFormValues) => {
    setSubmitting(true);
    try {
      await createTask({
        title: values.title,
        description: values.description,
        priority: values.priority,
        status: values.status,
        type: values.type,
        dueDate: values.dueDate
          ? new Date(values.dueDate).toISOString()
          : null,
        assignedToId:
          values.assignedToId === "self"
            ? employee?.id ?? "self"
            : values.assignedToId,
        relatedEntity:
          values.relatedEntityType !== "NONE" && values.relatedEntityId
            ? {
                type: values.relatedEntityType,
                id: values.relatedEntityId,
                label: values.relatedEntityLabel || undefined,
              }
            : null,
      });
      toast.success("Task created");
      router.push("/tasks");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create task";
      toast.error("Could not create task", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || isCreating;

  return (
    <>
      <PageHeader
        title="New task"
        description="Capture what needs to get done. Assign to yourself or a teammate."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/tasks">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Task details</CardTitle>
            <CardDescription>The basics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g. Follow up with Rajesh about bulk order"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-xs text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={4}
                placeholder="Add context, links, or instructions…"
                {...register("description")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={watch("priority")}
                  onValueChange={(v) =>
                    setValue("priority", v as TaskPriority, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {TASK_PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={watch("status")}
                  onValueChange={(v) =>
                    setValue("status", v as TaskStatus, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {TASK_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={watch("type")}
                  onValueChange={(v) =>
                    setValue("type", v as TaskType, { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, " ").toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  defaultValue={today}
                  {...register("dueDate")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assignment & link</CardTitle>
            <CardDescription>
              Who owns this task and what does it relate to?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Assign to <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={watch("assignedToId")}
                  onValueChange={(v) =>
                    setValue("assignedToId", v, { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAMMATES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.assignedToId && (
                  <p className="text-xs text-destructive">
                    {errors.assignedToId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Related to</Label>
                <Select
                  value={watch("relatedEntityType")}
                  onValueChange={(v) =>
                    setValue("relatedEntityType", v as RelatedEntityType, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Related entity" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATED_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === "NONE" ? "Nothing" : t.replace(/_/g, " ").toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {relatedEntityType !== "NONE" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="relatedEntityId">
                    {relatedEntityType.replace(/_/g, " ").toLowerCase()} ID
                  </Label>
                  <Input
                    id="relatedEntityId"
                    placeholder="e.g. cus_001"
                    {...register("relatedEntityId")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relatedEntityLabel">
                    Display label (optional)
                  </Label>
                  <Input
                    id="relatedEntityLabel"
                    placeholder="e.g. Rajesh Kumar"
                    {...register("relatedEntityLabel")}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button asChild variant="outline" type="button" disabled={busy}>
            <Link href="/tasks">Cancel</Link>
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Create task
              </>
            )}
          </Button>
        </div>
      </form>
    </>
  );
}
