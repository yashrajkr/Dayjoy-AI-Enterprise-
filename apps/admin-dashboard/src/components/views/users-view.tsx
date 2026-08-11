"use client";

import { useState, useMemo } from "react";
import { UserPlus, Trash2, Edit2, Shield, Mail, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Cell, DataTable, PageHeader, Pill, Row } from "@/components/kit/page-header";
import { StatusBadge } from "@/components/kit/status-badge";
import { FormDialog } from "@/components/kit/form-dialog";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Field } from "@/components/kit/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminStore, useCurrentUser } from "@/store/admin-store";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/rbac";
import { usePermissions } from "@/hooks/use-permissions";
import type { AdminUser, RoleName } from "@/types/domain";

const ROLE_TONES: Record<RoleName, "violet" | "brand" | "info" | "success" | "warning" | "muted"> = {
  SUPER_ADMIN: "violet",
  AI_ADMIN: "brand",
  KNOWLEDGE_ADMIN: "info",
  AUTOMATION_ADMIN: "success",
  ANALYTICS_ADMIN: "warning",
  SUPPORT_ADMIN: "muted",
};

const ALL_ROLES: RoleName[] = [
  "SUPER_ADMIN", "AI_ADMIN", "KNOWLEDGE_ADMIN",
  "AUTOMATION_ADMIN", "ANALYTICS_ADMIN", "SUPPORT_ADMIN",
];

export function UsersView() {
  const admins = useAdminStore((s) => s.admins);
  const create = useAdminStore((s) => s.create);
  const update = useAdminStore((s) => s.update);
  const remove = useAdminStore((s) => s.remove);
  const setCurrent = useAdminStore((s) => s.setCurrent);
  const currentUser = useCurrentUser();
  const { can } = usePermissions();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const stats = useMemo(() => {
    const active = admins.filter((a) => a.status === "active").length;
    const invited = admins.filter((a) => a.status === "invited").length;
    const suspended = admins.filter((a) => a.status === "suspended").length;
    const superAdmins = admins.filter((a) => a.role === "SUPER_ADMIN").length;
    return { total: admins.length, active, invited, suspended, superAdmins };
  }, [admins]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of admins) counts[a.role] = (counts[a.role] ?? 0) + 1;
    return counts;
  }, [admins]);

  return (
    <>
      <PageHeader
        title="Users & Roles"
        subtitle="Multi-admin access control. Manage authorized Dayjoy administrators and their permissions."
        actions={
          <Button
            onClick={() => {
              if (!can("admin", "create")) {
                toast.error("Permission denied", { description: "You cannot create new admins." });
                return;
              }
              setCreateOpen(true);
            }}
            className="bg-gradient-brand"
            size="sm"
          >
            <UserPlus className="mr-1.5 size-4" /> Add Admin
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total Admins", value: stats.total, tone: "brand" as const, icon: "👤" },
          { label: "Active", value: stats.active, tone: "success" as const, icon: "✓" },
          { label: "Invited", value: stats.invited, tone: "info" as const, icon: "✉" },
          { label: "Super Admins", value: stats.superAdmins, tone: "violet" as const, icon: "★" },
        ].map((s, i) => (
          <GlassCard key={s.label} delay={i * 0.05} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold num">{s.value}</p>
                <p className="mt-1 text-[13px] text-subtle">{s.label}</p>
              </div>
              <span className="text-2xl opacity-50">{s.icon}</span>
            </div>
          </GlassCard>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <GlassCard delay={0.1} className="p-5 lg:col-span-2">
          <CardHead title="Administrators" subtitle={`${admins.length} users with admin access`} />
          {admins.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No admins yet"
              description="Add your first admin to begin managing access."
              action={can("admin", "create") ? { label: "Add Admin", onClick: () => setCreateOpen(true) } : undefined}
            />
          ) : (
            <DataTable head={["User", "Role", "Status", "Last Active", ""]}>
              {admins.map((a) => (
                <Row key={a.id}>
                  <Cell className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="bg-gradient-brand grid size-9 shrink-0 place-items-center rounded-full p-[2px]">
                        <span className="grid size-full place-items-center rounded-full bg-background text-[11px] font-bold">
                          {a.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {a.name}
                          {a.id === currentUser?.id ? <span className="ml-2 text-[10px] text-brand">(you)</span> : null}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">{a.email}</p>
                      </div>
                    </div>
                  </Cell>
                  <Cell><Pill tone={ROLE_TONES[a.role]}>{ROLE_LABELS[a.role]}</Pill></Cell>
                  <Cell><StatusBadge status={a.status} /></Cell>
                  <Cell className="num text-[11px] text-muted-foreground">
                    {a.lastActiveAt ? new Date(a.lastActiveAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"}
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-1">
                      {a.id !== currentUser?.id && a.role !== "SUPER_ADMIN" && can("admin", "edit") ? (
                        <>
                          <button
                            onClick={() => setEditTarget(a)}
                            aria-label="Edit"
                            className="grid size-8 place-items-center rounded-lg border border-border bg-glass text-subtle transition-colors hover:text-brand"
                          >
                            <Edit2 className="size-3.5" />
                          </button>
                          {can("admin", "delete") ? (
                            <button
                              onClick={() => setDeleteTarget(a)}
                              aria-label="Delete"
                              className="grid size-8 place-items-center rounded-lg border border-border bg-glass text-subtle transition-colors hover:text-danger"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          ) : null}
                        </>
                      ) : a.role === "SUPER_ADMIN" ? (
                        <span className="text-[10px] text-muted-foreground">Protected</span>
                      ) : null}
                    </div>
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
        </GlassCard>

        <GlassCard delay={0.15} className="p-5">
          <CardHead title="Roles & Permissions" subtitle="RBAC role definitions" />
          <div className="mt-4 space-y-3">
            {ALL_ROLES.map((role) => (
              <div key={role} className="rounded-xl border border-border bg-glass p-3">
                <div className="flex items-center justify-between">
                  <Pill tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Pill>
                  <span className="num text-[11px] text-muted-foreground">{roleCounts[role] ?? 0} user(s)</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-subtle">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </section>

      <AdminFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => {
          create(data);
          toast.success("Admin invited", { description: `${data.name} (${data.email}) added as ${ROLE_LABELS[data.role]}.` });
        }}
      />

      {editTarget ? (
        <AdminFormDialog
          key={editTarget.id}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          initial={editTarget}
          onSubmit={(data) => {
            update(editTarget.id, data);
            toast.success("Admin updated", { description: `${data.name} now has role ${ROLE_LABELS[data.role]}.` });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove admin?"
        description={`${deleteTarget?.name} (${deleteTarget?.email}) will lose all access to the Dayjoy AI Control Center. This action cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (!deleteTarget) return;
          remove(deleteTarget.id);
          toast.success("Admin removed", { description: deleteTarget.email });
        }}
      />
    </>
  );
}

function AdminFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; email: string; role: RoleName; status: "active" | "invited" | "suspended" }) => void;
  initial?: AdminUser;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<RoleName>(initial?.role ?? "AI_ADMIN");
  const [status, setStatus] = useState<"active" | "invited" | "suspended">(initial?.status ?? "invited");

  const handleSubmit = () => {
    if (!name.trim()) throw new Error("Name is required");
    if (!email.trim()) throw new Error("Email is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
    onSubmit({ name: name.trim(), email: email.trim(), role, status });
    setName(""); setEmail(""); setRole("AI_ADMIN"); setStatus("invited");
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Admin" : "Invite Admin"}
      description={initial ? "Update the admin's details and role." : "Invite a new administrator to the Dayjoy AI Control Center."}
      onSubmit={handleSubmit}
      submitLabel={initial ? "Save Changes" : "Send Invite"}
      size="md"
    >
      <Field label="Full name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aishwarya Rao" className="h-10 border-border bg-glass" />
      </Field>
      <Field label="Email" required>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="aishwarya.rao@dayjoy.ai" type="email" className="h-10 border-border bg-glass" />
      </Field>
      <Field label="Role" required hint={ROLE_DESCRIPTIONS[role]}>
        <Select value={role} onValueChange={(v) => setRole(v as RoleName)}>
          <SelectTrigger className="h-10 border-border bg-glass"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ALL_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Status">
        <Select value={status} onValueChange={(v) => setStatus(v as "active" | "invited" | "suspended")}>
          <SelectTrigger className="h-10 border-border bg-glass"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </FormDialog>
  );
}
