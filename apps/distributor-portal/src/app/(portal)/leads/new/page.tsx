"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, UserPlus, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { InlineAlert } from "@/components/ui/inline-alert";
import { leadsService } from "@/lib/services";
import {
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
} from "@/lib/constants";
import { getScoreColor } from "@/lib/utils";
import type { Lead } from "@/types";

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    interest: "",
    source: "WEBSITE" as string,
    notes: "",
  });
  const [suggestedScore, setSuggestedScore] = useState<{
    score: number;
    reasoning: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      leadsService.create({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
        interest: form.interest || null,
        source: form.source,
        stage: "NEW",
        score: suggestedScore?.score ?? 50,
      }),
    onSuccess: (lead: Lead) => {
      toast.success("Lead created successfully.");
      router.push(`/leads/${lead.id}`);
    },
    onError: (err: Error) => {
      toast.error("Failed to create lead.");
      setFormError(err.message);
    },
  });

  const scoreMutation = useMutation({
    mutationFn: () =>
      leadsService.suggestScore({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        company: form.company || undefined,
        interest: form.interest || undefined,
        source: form.source,
      }),
    onSuccess: (data) => {
      setSuggestedScore(data);
      toast.success(`AI suggests a score of ${data.score}/100.`);
    },
    onError: () => toast.error("AI scoring failed. Try again."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("First name and last name are required.");
      return;
    }
    setFormError(null);
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Lead"
        description="Add a new prospect to your pipeline."
        icon={UserPlus}
        breadcrumbs={[
          { label: "Leads", href: "/leads" },
          { label: "New Lead" },
        ]}
        actions={
          <Button variant="outline" onClick={() => router.push("/leads")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Contact information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">
                  First name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">
                  Last name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="interest">Interest</Label>
                <Input
                  id="interest"
                  value={form.interest}
                  onChange={(e) =>
                    setForm({ ...form, interest: e.target.value })
                  }
                  placeholder="e.g. Glow Diffuser, Wellness range, Wholesale pricing"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="source">Source</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => setForm({ ...form, source: v })}
                >
                  <SelectTrigger id="source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {LEAD_SOURCE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Context, requirements, or context about this lead…"
                rows={5}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Notes will be added to the lead's activity timeline.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Lead Score
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Let the AI analyze the lead's source and intent to suggest an
                initial score (0–100).
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                loading={scoreMutation.isPending}
                onClick={() => scoreMutation.mutate()}
                disabled={!form.firstName || !form.lastName}
              >
                <Wand2 className="h-4 w-4" />
                {scoreMutation.isPending ? "Analyzing…" : "Suggest score"}
              </Button>
              {suggestedScore && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-mono text-3xl font-bold ${getScoreColor(
                        suggestedScore.score,
                      )}`}
                    >
                      {suggestedScore.score}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 100</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {suggestedScore.reasoning}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {formError && (
            <InlineAlert variant="error">{formError}</InlineAlert>
          )}

          <Card>
            <CardContent className="space-y-3 p-4">
              <Button
                type="submit"
                className="w-full"
                loading={createMutation.isPending}
              >
                Create Lead
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => router.push("/leads")}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
