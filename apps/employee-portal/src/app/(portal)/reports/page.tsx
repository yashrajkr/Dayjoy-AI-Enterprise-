"use client";

import { BarChart3, Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Generate and download operational reports."
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { name: "My activity (this week)", desc: "Tasks, tickets, calls." },
          { name: "Customer LTV summary", desc: "Lifetime value by customer." },
          { name: "Lead pipeline snapshot", desc: "Pipeline by stage." },
          { name: "Ticket SLA report", desc: "First-response & resolution times." },
          { name: "Distributor performance", desc: "Revenue & downline." },
          { name: "Knowledge base hits", desc: "Top articles this month." },
        ].map((r) => (
          <Card key={r.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-primary" /> {r.name}
              </CardTitle>
              <CardDescription>{r.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-6">
        <EmptyState
          icon={BarChart3}
          title="Custom reports coming soon"
          description="Need a custom report? Ask the AI Assistant to draft one."
        />
      </div>
    </>
  );
}
