"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export interface CalendarProps {
  /** Currently focused month. */
  month?: Date;
  onMonthChange?: (date: Date) => void;
  /** Selected date (single-select mode). */
  selected?: Date;
  onSelect?: (date: Date) => void;
  /** Cell renderer for the date — e.g. to render attendance status dots. */
  renderDay?: (date: Date) => React.ReactNode;
  className?: string;
  /** Disable interaction (read-only month grid). */
  readOnly?: boolean;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function Calendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  renderDay,
  className,
  readOnly = false,
}: CalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState<Date>(month ?? new Date());
  const activeMonth = month ?? internalMonth;

  function handlePrev() {
    const prev = subMonths(activeMonth, 1);
    onMonthChange?.(prev);
    setInternalMonth(prev);
  }
  function handleNext() {
    const next = addMonths(activeMonth, 1);
    onMonthChange?.(next);
    setInternalMonth(next);
  }

  const start = startOfWeek(startOfMonth(activeMonth), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(activeMonth), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end });

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrev}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "h-8 w-8",
          )}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-semibold text-foreground">
          {format(activeMonth, "MMMM yyyy")}
        </h3>
        <button
          type="button"
          onClick={handleNext}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "h-8 w-8",
          )}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="flex h-8 items-center justify-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const inMonth = isSameMonth(day, activeMonth);
          const isSel = selected ? isSameDay(day, selected) : false;
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={readOnly}
              onClick={() => onSelect?.(day)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors",
                !inMonth && "text-muted-foreground/40",
                inMonth && "text-foreground",
                !readOnly && "hover:bg-white/[0.06]",
                isSel && "bg-aurora text-white hover:bg-aurora",
                today && !isSel && "ring-1 ring-inset ring-cyan/60",
                readOnly && "cursor-default",
              )}
            >
              <span className={cn("leading-none", isSel && "font-semibold")}>
                {format(day, "d")}
              </span>
              {renderDay?.(day)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
