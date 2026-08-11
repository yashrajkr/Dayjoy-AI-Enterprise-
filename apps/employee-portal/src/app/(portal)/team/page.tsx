"use client";

import { useState } from "react";
import { Mail, Phone, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { useDebounce } from "@/hooks/use-debounce";
import { getInitials } from "@/lib/utils";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
}

const TEAM: TeamMember[] = [
  { id: "u_001", name: "Priya Sharma", email: "priya@dayjoyai.com", phone: "+91 98765 11111", role: "MANAGER", department: "SALES", status: "ACTIVE" },
  { id: "u_002", name: "Rahul Verma", email: "rahul@dayjoyai.com", phone: "+91 98765 22222", role: "AGENT", department: "SALES", status: "ACTIVE" },
  { id: "u_003", name: "Sneha Iyer", email: "sneha@dayjoyai.com", phone: "+91 98765 33333", role: "SUPPORT", department: "SUPPORT", status: "ACTIVE" },
  { id: "u_004", name: "Amit Singh", email: "amit@dayjoyai.com", phone: "+91 98765 44444", role: "EMPLOYEE", department: "OPERATIONS", status: "ON_LEAVE" },
  { id: "u_005", name: "Karan Mehta", email: "karan@dayjoyai.com", phone: "+91 98765 55555", role: "SALES", department: "SALES", status: "ACTIVE" },
  { id: "u_006", name: "Deepika Nair", email: "deepika@dayjoyai.com", phone: "+91 98765 66666", role: "EMPLOYEE", department: "MARKETING", status: "ACTIVE" },
];

export default function TeamPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);

  const filtered = TEAM.filter(
    (m) =>
      !debounced ||
      m.name.toLowerCase().includes(debounced.toLowerCase()) ||
      m.email.toLowerCase().includes(debounced.toLowerCase()) ||
      m.role.toLowerCase().includes(debounced.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Team"
        description="Reach out to teammates across departments."
      />
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, role…"
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No teammates match" description="Try a different search." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <Avatar className="h-11 w-11">
                  <AvatarFallback>{getInitials(m.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.role.replace(/_/g, " ").toLowerCase()} · {m.department.toLowerCase()}
                  </p>
                  <div className="mt-2 space-y-1">
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Mail className="h-3 w-3" /> {m.email}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Phone className="h-3 w-3" /> {m.phone}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={
                        m.status === "ACTIVE"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : m.status === "ON_LEAVE"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            : "bg-muted text-muted-foreground"
                      }
                    >
                      {m.status.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`mailto:${m.email}`}>Message</a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
