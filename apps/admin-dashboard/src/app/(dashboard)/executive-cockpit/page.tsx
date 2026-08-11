"use client";

import { useState, useEffect } from "react";
import {
  Activity, AlertCircle, Brain, TrendingUp, Target, Zap, Loader2,
  Lightbulb, BarChart3, RefreshCw, ChevronRight, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type QuestionType = "what_is_happening" | "why" | "what_will_happen" | "what_should_we_do" | "expected_impact";

const QUESTIONS: Array<{ type: QuestionType; label: string; icon: any; color: string; description: string }> = [
  { type: "what_is_happening", label: "What is happening?", icon: Activity, color: "text-indigo", description: "Current state snapshot" },
  { type: "why", label: "Why is it happening?", icon: AlertCircle, color: "text-warning", description: "Root-cause analysis" },
  { type: "what_will_happen", label: "What will happen?", icon: TrendingUp, color: "text-indigo", description: "Predictions + forecasts" },
  { type: "what_should_we_do", label: "What should we do?", icon: Target, color: "text-success", description: "Recommendations + decisions" },
  { type: "expected_impact", label: "Expected impact?", icon: Zap, color: "text-warning", description: "Impact simulation" },
];

export default function ExecutiveCockpitPage() {
  const [activeQuestion, setActiveQuestion] = useState<QuestionType | null>(null);
  const [answer, setAnswer] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function askQuestion(type: QuestionType) {
    setActiveQuestion(type);
    setIsLoading(true); setError(null); setAnswer(null);
    try {
      const context: Record<string, unknown> = {};
      if (type === "what_will_happen") {
        context.prediction_type = "sales";
        context.horizon_days = 30;
      } else if (type === "expected_impact") {
        context.action = "Increase sales team headcount by 20%";
        context.params = { growth_rate: 0.05 };
      } else if (type === "why") {
        context.metric = "revenue";
      }
      const resp = await api.post<{ data: any }>("/enterprise-os/copilot/ask", {
        question_type: type,
        context,
      });
      setAnswer(resp.data);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Question failed.");
    }
    setIsLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          Executive Cockpit
        </h1>
        <p className="text-sm text-muted-foreground">Ask any executive question — the AI will analyze the entire organization to answer</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* Question cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
        {QUESTIONS.map((q) => (
          <Card key={q.type}
                className={`cursor-pointer transition-all hover:shadow-md ${activeQuestion === q.type ? "border-primary ring-2 ring-primary/20" : ""}`}
                onClick={() => askQuestion(q.type)}>
            <CardContent className="p-4">
              <div className="flex flex-col items-start gap-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.02] ${q.color}`}>
                  <q.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{q.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>
                </div>
                {activeQuestion === q.type && (
                  <Badge className="text-[10px] mt-1">Active</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Answer panel */}
      {activeQuestion && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" /> Answer
              <Badge variant="outline" className="text-[10px]">{activeQuestion.replace(/_/g, " ")}</Badge>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => askQuestion(activeQuestion)}>
              <RefreshCw className="h-3 w-3 mr-1" /> Re-ask
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Analyzing the organization...</span>
              </div>
            ) : answer ? (
              <AnswerRenderer questionType={activeQuestion} answer={answer} />
            ) : (
              <p className="text-sm text-muted-foreground">No answer yet.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnswerRenderer({ questionType, answer }: { questionType: QuestionType; answer: any }) {
  if (questionType === "what_is_happening") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground/80">{answer.summary}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Active Simulations" value={answer.active_simulations} icon={Activity} />
          <StatBox label="Pending Decisions" value={answer.pending_decisions} icon={Target} />
          <StatBox label="Pending Recommendations" value={answer.pending_recommendations} icon={Lightbulb} />
          <StatBox label="Running Executions" value={answer.running_executions} icon={Zap} />
        </div>
        {Object.keys(answer.twin_types || {}).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-foreground/80 mb-2">Digital Twins by Type</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(answer.twin_types).map(([type, info]: [string, any]) => (
                <Badge key={type} variant="outline" className="capitalize">
                  {type.replace("_", " ")}: {info.count}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Generated: {new Date(answer.timestamp).toLocaleString()}</p>
      </div>
    );
  }

  if (questionType === "why") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground/80">
          {answer.target_metric && <span>Target metric: <strong>{answer.target_metric}</strong>. </span>}
          Identified <strong>{answer.cause_count}</strong> potential cause(s):
        </p>
        {answer.identified_causes && answer.identified_causes.length > 0 ? (
          <div className="space-y-2">
            {answer.identified_causes.map((cause: any, i: number) => (
              <div key={i} className="rounded border p-3">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">{cause.type}</Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{cause.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{cause.explanation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No specific causes identified — system is operating normally.</p>
        )}
        <div className="rounded-md bg-indigo/10 p-3 text-sm text-indigo">
          <Lightbulb className="inline h-4 w-4 mr-1" />
          {answer.recommendation}
        </div>
      </div>
    );
  }

  if (questionType === "what_will_happen") {
    const preds = (answer.predictions || []).slice(0, 14);
    const maxVal = Math.max(...preds.map((p: any) => p.value || 0), 1);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant="outline">{answer.prediction_type}</Badge>
          <Badge variant="outline">{answer.horizon_days} day horizon</Badge>
          <Badge variant="outline">Confidence: {(answer.confidence_score * 100).toFixed(0)}%</Badge>
          <Badge variant="outline">{answer.source}</Badge>
        </div>
        {preds.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground/80">Forecast (first 14 days):</p>
            {preds.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-20 text-xs text-muted-foreground font-mono">
                  {p.date ? new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : `Day ${i + 1}`}
                </span>
                <div className="flex-1 bg-white/[0.04] rounded h-5 relative">
                  <div className="absolute inset-y-0 left-0 bg-aurora rounded"
                       style={{ width: `${(p.value / maxVal) * 100}%` }} />
                  <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-foreground/80">
                    {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {answer.aggregates && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatBox label="Total" value={(answer.aggregates.total || 0).toFixed(0)} icon={BarChart3} />
            <StatBox label="Mean" value={(answer.aggregates.mean || 0).toFixed(2)} icon={Activity} />
            <StatBox label="Min" value={(answer.aggregates.min || 0).toFixed(2)} icon={TrendingUp} />
            <StatBox label="Max" value={(answer.aggregates.max || 0).toFixed(2)} icon={TrendingUp} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">Model: {answer.model_name} · Generated: {answer.generated_at ? new Date(answer.generated_at).toLocaleString() : "—"}</p>
      </div>
    );
  }

  if (questionType === "what_should_we_do") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground/80">
          <strong>{answer.total_pending_recommendations}</strong> pending recommendation(s) + {answer.pending_decisions?.length || 0} pending decision(s):
        </p>
        {answer.top_recommendations && answer.top_recommendations.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground/80">Top Recommendations:</p>
            {answer.top_recommendations.map((r: any, i: number) => (
              <div key={r.id || i} className="rounded border p-3">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium">{r.title}</p>
                  <Badge className={
                    r.priority === "critical" ? "bg-destructive/15 text-destructive" :
                    r.priority === "high" ? "bg-warning/15 text-warning" :
                    r.priority === "medium" ? "bg-warning/15 text-warning" :
                    "bg-white/[0.04]"
                  }>{r.priority}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                <div className="flex gap-2 mt-2 text-xs">
                  <Badge variant="outline" className="capitalize">{r.category}</Badge>
                  <Badge variant="outline">{r.recommendation_type}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No pending recommendations.</p>
        )}
        {answer.pending_decisions && answer.pending_decisions.length > 0 && (
          <div className="space-y-2 mt-4">
            <p className="text-xs font-semibold text-foreground/80">Pending Decisions:</p>
            {answer.pending_decisions.map((d: any) => (
              <div key={d.id} className="rounded border p-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.decision_type} · {d.category || "uncategorized"}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (questionType === "expected_impact") {
    const aggregates = answer.aggregates || {};
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground/80">
          Analyzed impact of: <strong>{answer.target_action}</strong>
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Confidence: {answer.confidence}</Badge>
          <Badge variant="outline">Monte Carlo runs: {answer.monte_carlo_runs}</Badge>
          <Badge variant="outline">Simulation ID: {answer.simulation_id?.slice(0, 8)}</Badge>
        </div>
        {Object.keys(aggregates).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground/80">Aggregate Outcomes:</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {Object.entries(aggregates).slice(0, 9).map(([key, val]: [string, any]) => (
                <div key={key} className="rounded border p-2">
                  <p className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                  <p className="text-sm font-semibold">
                    {typeof val === "object" && val !== null
                      ? `μ=${val.mean?.toFixed(2) || 0}`
                      : typeof val === "number" ? val.toFixed(2) : String(val)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Generated: {new Date(answer.timestamp).toLocaleString()}</p>
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">Unsupported question type.</p>;
}

function StatBox({ label, value, icon: Icon }: { label: string; value: any; icon: any }) {
  return (
    <div className="rounded border p-2">
      <div className="flex items-center gap-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
      <p className="text-base font-semibold mt-0.5">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}
