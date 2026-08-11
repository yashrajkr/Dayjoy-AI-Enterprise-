"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, Volume2, VolumeX, Copy, Check } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CitationCard } from "./citation-card";
import { cn, copyToClipboard, formatRelativeTime } from "@/lib/utils";

interface ChatMessageProps {
  message: ChatMessage;
  /** Author display name (defaults to "You" / "Assistant"). */
  userName?: string;
  /** Whether to enable the text-to-speech action on assistant messages. */
  speakEnabled?: boolean;
  /** Active TTS state — when true, this message is being read aloud. */
  speaking?: boolean;
  onSpeak?: (message: ChatMessage) => void;
  onCancelSpeak?: () => void;
}

/**
 * Single chat message bubble. User messages are right-aligned with the
 * Dayjoy orange; assistant messages are left-aligned with an avatar,
 * markdown content, citation cards, and TTS actions.
 */
export function ChatMessageBubble({
  message,
  userName = "You",
  speakEnabled = false,
  speaking = false,
  onSpeak,
  onCancelSpeak,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await copyToClipboard(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex w-full gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          className={cn(
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "flex min-w-0 max-w-[85%] flex-col gap-1.5",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 text-[11px] text-muted-foreground",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className="font-medium text-foreground">
            {isUser ? userName : "Dayjoy AI Assistant"}
          </span>
          <span>·</span>
          <time dateTime={message.createdAt}>
            {formatRelativeTime(message.createdAt)}
          </time>
        </div>

        <div
          className={cn(
            isUser
              ? "chat-bubble-user"
              : "chat-bubble-assistant",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </p>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content || ""}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {message.citations && message.citations.length > 0 ? (
          <div className="mt-1 w-full space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sources
            </p>
            {message.citations.map((c, i) => (
              <CitationCard
                key={c.id}
                citation={c}
                index={i}
                className="bg-card/60"
              />
            ))}
          </div>
        ) : null}

        {!isUser ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={handleCopy}
              aria-label="Copy response"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </Button>
            {speakEnabled ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground"
                onClick={() =>
                  speaking ? onCancelSpeak?.() : onSpeak?.(message)
                }
                aria-label={
                  speaking ? "Stop reading aloud" : "Read response aloud"
                }
              >
                {speaking ? (
                  <>
                    <VolumeX className="h-3 w-3" />
                    Stop
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3 w-3" />
                    Listen
                  </>
                )}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
