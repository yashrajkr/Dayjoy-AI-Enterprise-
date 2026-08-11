"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Mail, Phone, Plus, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDistributor } from "@/hooks/use-crm";
import { DISTRIBUTOR_TIER_LABELS } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  formatNumber,
  getStatusColor,
} from "@/lib/utils";

export default function DistributorDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: distributor, isLoading, isError } = useDistributor(params.id);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Distributor" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  if (isError || !distributor) {
    return (
      <EmptyState
        title="Distributor not found"
        description="This distributor may have been deleted."
        action={
          <Button asChild size="sm">
            <Link href="/crm/distributors">Back to distributors</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title={distributor.companyName}
        description={`${distributor.code} · ${DISTRIBUTOR_TIER_LABELS[distributor.tier]} tier · joined ${distributor.joinedAt ? formatDate(distributor.joinedAt) : "—"}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/crm/distributors">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left — contact + commission */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{distributor.contactPerson ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{distributor.email ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{distributor.phone ?? "—"}</span>
              </div>
              {distributor.gstin && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">GSTIN:</span>
                  <span className="font-mono text-xs">{distributor.gstin}</span>
                </div>
              )}
              {(distributor.city || distributor.state) && (
                <p className="text-xs text-muted-foreground">
                  {distributor.city}
                  {distributor.state ? `, ${distributor.state}` : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Partnership</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Stat
                label="Tier"
                value={
                  <Badge variant="secondary">
                    {DISTRIBUTOR_TIER_LABELS[distributor.tier]}
                  </Badge>
                }
              />
              <Stat
                label="Commission rate"
                value={`${distributor.commissionRate ?? 0}%`}
              />
              <Stat
                label="Status"
                value={
                  <Badge
                    variant="outline"
                    className={cn(getStatusColor(distributor.status))}
                  >
                    {distributor.status.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                }
              />
              <Stat
                label="Lifetime value"
                value={formatCurrency(distributor.lifetimeValue, distributor.currency)}
              />
              <Stat
                label="Total orders"
                value={formatNumber(distributor.totalOrders ?? 0)}
              />
              <Stat
                label="Downline size"
                value={formatNumber(distributor.totalDownline ?? 0)}
              />
              {distributor.parentDistributorName && (
                <Stat
                  label="Parent"
                  value={distributor.parentDistributorName}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link
                  href={`/tasks/new?relatedType=DISTRIBUTOR&relatedId=${distributor.id}&relatedLabel=${encodeURIComponent(distributor.companyName)}`}
                >
                  <Plus className="h-4 w-4" /> Create task
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right — performance, sales points, team, orders */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Sales performance</CardTitle>
              <CardDescription>Last 3 months.</CardDescription>
            </CardHeader>
            <CardContent>
              {distributor.performance && distributor.performance.length > 0 ? (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={distributor.performance}
                      margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="month"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => formatCurrency(v)}
                      />
                      <Bar
                        dataKey="revenue"
                        name="Revenue"
                        fill="#f97316"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No performance data yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="team">
            <TabsList>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="sales-points">Sales points</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="team">
              <Card>
                <CardHeader>
                  <CardTitle>Downline team</CardTitle>
                  <CardDescription>
                    Distributors sponsored by {distributor.companyName}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {distributor.team && distributor.team.length > 0 ? (
                    <ul className="divide-y divide-border">
                      {distributor.team.map((m) => (
                        <li key={m.id} className="flex items-center gap-3 py-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                            <Users className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{m.name}</p>
                            {m.joinedAt && (
                              <p className="text-xs text-muted-foreground">
                                Joined {formatDate(m.joinedAt)}
                              </p>
                            )}
                          </div>
                          {m.tier && (
                            <Badge variant="secondary">
                              {DISTRIBUTOR_TIER_LABELS[m.tier]}
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No downline members yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales-points">
              <Card>
                <CardHeader>
                  <CardTitle>Sales points</CardTitle>
                  <CardDescription>
                    Physical locations operated by this distributor.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {distributor.salesPoints && distributor.salesPoints.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead className="w-[120px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {distributor.salesPoints.map((sp) => (
                          <TableRow key={sp.id}>
                            <TableCell className="text-sm">{sp.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {sp.city ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(getStatusColor(sp.status))}
                              >
                                {sp.status.toLowerCase()}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No sales points listed.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orders">
              <Card>
                <CardHeader>
                  <CardTitle>Recent orders</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {distributor.totalOrders ?? 0} orders on file. View orders
                    in the orders module.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
