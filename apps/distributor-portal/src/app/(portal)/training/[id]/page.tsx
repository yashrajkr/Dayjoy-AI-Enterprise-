"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  GraduationCap,
  ListChecks,
  Lock,
  PlayCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Separator } from "@/components/ui/separator";
import { trainingService } from "@/lib/services";
import { TRAINING_CATEGORY_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function TrainingModulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<{ passed: boolean; score: number } | null>(null);

  const { data: module, isLoading, isError, error } = useQuery({
    queryKey: ["training-module", params.id],
    queryFn: () => trainingService.get(params.id),
    enabled: !!params.id,
  });

  const { data: allModules } = useQuery({
    queryKey: ["training-all"],
    queryFn: () => trainingService.list(),
  });

  const completeMutation = useMutation({
    mutationFn: () => trainingService.markComplete(params.id),
    onSuccess: () => {
      toast.success("Module marked as complete!");
      queryClient.invalidateQueries({ queryKey: ["training-module", params.id] });
      queryClient.invalidateQueries({ queryKey: ["training"] });
    },
    onError: () => toast.error("Failed to mark as complete."),
  });

  const quizMutation = useMutation({
    mutationFn: () =>
      trainingService.submitQuiz(
        params.id,
        module?.quiz?.questions.map((_, idx) => quizAnswers[idx] ?? 0) ?? [],
      ),
    onSuccess: (result) => {
      setQuizResult(result);
      if (result.passed) {
        toast.success(`Quiz passed with ${result.score}%!`);
      } else {
        toast.error(`Quiz score: ${result.score}%. Try again.`);
      }
    },
    onError: () => toast.error("Failed to submit quiz."),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError || !module) {
    return (
      <InlineAlert variant="error">
        Failed to load training module: {(error as Error)?.message ?? "Not found"}.{" "}
        <button
          type="button"
          onClick={() => router.push("/training")}
          className="underline"
        >
          Back to training
        </button>
      </InlineAlert>
    );
  }

  if (module.locked) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={module.title}
          icon={Lock}
          breadcrumbs={[
            { label: "Training", href: "/training" },
            { label: module.title },
          ]}
          actions={
            <Button variant="outline" onClick={() => router.push("/training")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          }
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Lock className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-semibold text-foreground">
              This module is locked
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Complete the prerequisite modules to unlock this training.
            </p>
            <Button className="mt-4" asChild>
              <Link href="/training">Browse other modules</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Find prev/next modules
  const sorted = (allModules ?? []).sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((m) => m.id === module.id);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={module.title}
        description={module.description}
        icon={GraduationCap}
        breadcrumbs={[
          { label: "Training", href: "/training" },
          { label: module.title },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/training")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {!module.completed && (
              <Button
                onClick={() => completeMutation.mutate()}
                loading={completeMutation.isPending}
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark as complete
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Video / Document player */}
          <Card>
            <CardContent className="p-0">
              {module.type === "VIDEO" && module.videoUrl ? (
                <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-black">
                  <iframe
                    src={module.videoUrl}
                    title={module.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              ) : module.type === "DOCUMENT" && module.documentUrl ? (
                <div className="flex aspect-video w-full flex-col items-center justify-center rounded-t-xl bg-muted">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Document-based module
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => window.open(module.documentUrl, "_blank")}
                  >
                    <Download className="h-4 w-4" />
                    Open document
                  </Button>
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-t-xl bg-muted">
                  <PlayCircle className="h-12 w-12 text-muted-foreground" />
                </div>
              )}

              <div className="flex items-center justify-between gap-2 p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {TRAINING_CATEGORY_LABELS[module.category]}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {Math.round(module.duration / 60)} min
                  </Badge>
                  {module.completed && (
                    <Badge variant="success">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed
                    </Badge>
                  )}
                </div>
                <Progress
                  value={module.progress}
                  className="h-2 w-32"
                />
              </div>
            </CardContent>
          </Card>

          {/* Outline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Module outline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {module.outline.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-sm text-foreground"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Quiz */}
          {module.quiz && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="h-4 w-4 text-primary" />
                  Quiz · Pass at {module.quiz.passingScore}%
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {module.quiz.questions.map((q, qIdx) => (
                  <div key={q.id}>
                    <p className="mb-2 text-sm font-medium text-foreground">
                      {qIdx + 1}. {q.question}
                    </p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, oIdx) => (
                        <label
                          key={oIdx}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/30",
                            quizAnswers[qIdx] === oIdx &&
                              "border-primary bg-primary/5",
                          )}
                        >
                          <input
                            type="radio"
                            name={`q-${qIdx}`}
                            className="h-4 w-4"
                            checked={quizAnswers[qIdx] === oIdx}
                            onChange={() =>
                              setQuizAnswers({
                                ...quizAnswers,
                                [qIdx]: oIdx,
                              })
                            }
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {quizResult && (
                  <div
                    className={cn(
                      "rounded-lg border p-3 text-center text-sm",
                      quizResult.passed
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
                    )}
                  >
                    {quizResult.passed
                      ? `🎉 Passed with ${quizResult.score}%!`
                      : `Score: ${quizResult.score}%. You need ${module.quiz.passingScore}% to pass.`}
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={() => quizMutation.mutate()}
                  loading={quizMutation.isPending}
                  disabled={
                    Object.keys(quizAnswers).length <
                    module.quiz.questions.length
                  }
                >
                  Submit quiz
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — nav + materials */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Navigate modules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {prev ? (
                <Link
                  href={`/training/${prev.id}`}
                  className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-accent/30"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Previous
                    </p>
                    <p className="truncate font-medium text-foreground">
                      {prev.title}
                    </p>
                  </div>
                </Link>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  This is the first module.
                </div>
              )}
              {next ? (
                <Link
                  href={`/training/${next.id}`}
                  className="flex items-center justify-end gap-2 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-accent/30"
                >
                  <div className="min-w-0 text-right">
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Next
                    </p>
                    <p className="truncate font-medium text-foreground">
                      {next.title}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  You've reached the end.
                </div>
              )}
            </CardContent>
          </Card>

          {module.documentUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Materials</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open(module.documentUrl, "_blank")}
                >
                  <Download className="h-4 w-4" />
                  Download materials
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
