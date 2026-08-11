"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Mic, MicOff, Paperclip, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSpeech } from "@/hooks/use-speech";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Chat input — auto-growing textarea + send button + voice input +
 * file attach + quick-reply chips. Voice input is wired to the Web
 * Speech API via `useSpeech`; file attach is a non-functional affordance
 * (the backend `POST /ai/conversations/:id/messages` accepts attachments
 * in a future API revision).
 */
export function ChatInput({
  onSend,
  disabled,
  isStreaming,
  onStop,
  quickReplies,
  onQuickReply,
  placeholder = "Ask me anything about your order, products, or account…",
  className,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    listening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    speechRecognitionSupported,
  } = useSpeech({ lang: "en-IN", interimResults: true });

  // Sync speech transcript into the textarea as it streams in.
  useEffect(() => {
    if (listening && transcript) setValue(transcript);
  }, [listening, transcript]);

  // Auto-grow the textarea up to ~6 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue("");
    resetTranscript();
    // Refocus after sending so the user can type the next message.
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const toggleMic = () => {
    if (listening) {
      stopListening();
    } else {
      setValue("");
      resetTranscript();
      startListening();
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {quickReplies && quickReplies.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onQuickReply?.(q)}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={submit}
        className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20"
      >
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground"
                aria-label="Attach a file"
                // Backend will accept attachments in a future revision.
                disabled
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attachments coming soon</TooltipContent>
          </Tooltip>

          {speechRecognitionSupported ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={listening ? "default" : "ghost"}
                  size="icon"
                  className={cn(
                    "h-9 w-9 shrink-0",
                    listening
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : "text-muted-foreground",
                  )}
                  onClick={toggleMic}
                  aria-label={listening ? "Stop voice input" : "Start voice input"}
                >
                  {listening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {listening ? "Stop voice input" : "Voice input"}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </TooltipProvider>

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? "Listening…" : placeholder}
          rows={1}
          disabled={disabled}
          className="min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label="Message"
        />

        {isStreaming ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onStop}
            aria-label="Stop generating"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!value.trim() || disabled}
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </form>
      <p className="px-2 text-[11px] text-muted-foreground">
        AI responses may be inaccurate. Press{" "}
        <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">
          Enter
        </kbd>{" "}
        to send,{" "}
        <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">
          Shift+Enter
        </kbd>{" "}
        for a new line.
      </p>
    </div>
  );
}
