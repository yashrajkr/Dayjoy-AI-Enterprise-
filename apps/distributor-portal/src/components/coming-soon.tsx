"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowRight, Construction } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
  features?: string[];
}

/**
 * Generic "coming soon" page for portal routes that aren't part of the
 * core scope (Leads, Customers, Products, Orders, AI Assistant,
 * Training, Knowledge, Notifications, Profile, Settings). They render
 * a friendly placeholder so the navigation doesn't 404 and the user
 * understands what's planned.
 */
export function ComingSoon({
  title,
  description,
  icon: Icon,
  features,
}: ComingSoonProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-foreground">
            Coming soon
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            We&apos;re putting the finishing touches on this section. In the
            meantime, the dashboard, team, sales, earnings, and commissions
            pages are fully functional.
          </p>

          {features && features.length > 0 && (
            <ul className="mt-6 grid gap-2 text-left text-sm text-muted-foreground">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Construction className="h-3.5 w-3.5 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          )}

          <Button asChild className="mt-6">
            <Link href="/dashboard">
              Back to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
