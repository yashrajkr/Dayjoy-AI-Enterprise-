"use client";

import * as React from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

/**
 * Error boundary for the chat widget.
 *
 * Catches render-time errors anywhere in the chat widget subtree
 * (e.g. malformed message content, broken Markdown, theme regressions)
 * and shows a friendly fallback instead of a blank screen. Errors are
 * re-thrown to the nearest parent error boundary if the user clicks
 * "Reset conversation" — this also clears the persisted session.
 *
 * Note: error boundaries MUST be class components in React. Hooks-based
 * alternatives like `react-error-boundary` exist but adding a dep for
 * one component isn't worth it.
 */
interface ChatErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional label shown above the error message. */
  label?: string;
  /** Called when an error is caught (e.g. for Sentry). */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ChatErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ChatErrorBoundary extends React.Component<
  ChatErrorBoundaryProps,
  ChatErrorBoundaryState
> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[dayjoy-chat] render error:", error, info);
    this.props.onError?.(error, info);
  }

  private handleReset = (): void => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("dayjoy-chat-session");
      } catch {
        /* noop */
      }
    }
    this.setState({ hasError: false, error: null });
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      const label = this.props.label ?? "Chat error";
      return (
        <div
          role="alert"
          className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 bg-background p-6 text-center"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle
              className="h-6 w-6 text-destructive"
              aria-hidden="true"
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              The chat ran into an unexpected problem. Try resetting the
              conversation — your session will start fresh.
            </p>
            {this.state.error?.message && (
              <p className="mt-2 break-words font-mono text-[10px] text-muted-foreground/70">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reset conversation
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
