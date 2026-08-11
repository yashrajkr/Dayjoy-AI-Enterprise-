"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FaqItem } from "@/types";

interface FaqItemProps {
  faq: FaqItem;
  /** Stable value across renders so accordion state persists. */
  value?: string;
  /** Called when the user submits feedback for this FAQ. */
  onFeedback?: (id: string, helpful: boolean) => void;
  className?: string;
}

/**
 * Expandable FAQ item — uses Radix Accordion for accessibility.
 * Renders the question as a trigger and the answer as collapsible
 * content. A two-button feedback row appears when expanded.
 */
export function FaqItemRow({
  faq,
  value,
  onFeedback,
  className,
}: FaqItemProps) {
  const [feedback, setFeedback] = useState<"helpful" | "not-helpful" | null>(
    null,
  );
  const itemValue = value ?? faq.id;

  const handleFeedback = (h: boolean) => {
    setFeedback(h ? "helpful" : "not-helpful");
    onFeedback?.(faq.id, h);
  };

  return (
    <AccordionItem value={itemValue} className={cn(className)}>
      <AccordionTrigger className="items-start gap-3">
        <span className="flex-1 text-left text-sm font-medium text-foreground">
          {faq.question}
        </span>
        {faq.category ? (
          <Badge variant="muted" className="shrink-0 text-[10px]">
            {faq.category}
          </Badge>
        ) : null}
      </AccordionTrigger>
      <AccordionContent>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {faq.answer}
        </p>
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Was this helpful?</span>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1 px-2 text-xs",
              feedback === "helpful" && "bg-success/10 text-success",
            )}
            onClick={() => handleFeedback(true)}
            disabled={feedback !== null}
          >
            <ThumbsUp className="h-3 w-3" />
            Yes
            {typeof faq.helpful === "number" ? (
              <span className="text-muted-foreground">{faq.helpful}</span>
            ) : null}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1 px-2 text-xs",
              feedback === "not-helpful" && "bg-destructive/10 text-destructive",
            )}
            onClick={() => handleFeedback(false)}
            disabled={feedback !== null}
          >
            <ThumbsDown className="h-3 w-3" />
            No
            {typeof faq.notHelpful === "number" ? (
              <span className="text-muted-foreground">{faq.notHelpful}</span>
            ) : null}
          </Button>
          {feedback ? (
            <span className="text-xs text-muted-foreground">
              Thanks for your feedback!
            </span>
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
