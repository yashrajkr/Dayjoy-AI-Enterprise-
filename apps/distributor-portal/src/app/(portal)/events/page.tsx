"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  PlayCircle,
  Users,
  Video,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { eventsService } from "@/lib/services";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import type { EventItem } from "@/types";

const TYPE_LABELS: Record<EventItem["type"], string> = {
  WEBINAR: "Webinar",
  TRAINING: "Training",
  MEETING: "Meeting",
  LAUNCH: "Launch",
};

const TYPE_COLOR: Record<EventItem["type"], string> = {
  WEBINAR: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  TRAINING: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  MEETING: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  LAUNCH: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

export default function EventsPage() {
  const queryClient = useQueryClient();

  const { data: events, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["events"],
    queryFn: () => eventsService.list(),
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ id, attending }: { id: string; attending: boolean }) =>
      eventsService.rsvp(id, attending),
    onSuccess: (_, { attending }) => {
      toast.success(
        attending ? "RSVP confirmed. See you there!" : "RSVP cancelled.",
      );
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: () => toast.error("Failed to update RSVP."),
  });

  const upcoming = (events ?? []).filter((e) => !e.past);
  const past = (events ?? []).filter((e) => e.past);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Webinars, trainings, meetings, and product launches."
        icon={CalendarDays}
      />

      {isError && (
        <InlineAlert variant="error">
          Failed to load events: {(error as Error)?.message ?? "Unknown error"}.{" "}
          <button
            type="button"
            onClick={() => refetch()}
            className="underline underline-offset-2"
          >
            Retry
          </button>
        </InlineAlert>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <>
          {/* Upcoming */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Upcoming events
              <Badge variant="secondary">{upcoming.length}</Badge>
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming events"
                description="Check back soon — new events are added weekly."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {upcoming.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onRsvp={(attending) =>
                      rsvpMutation.mutate({ id: event.id, attending })
                    }
                    pending={rsvpMutation.isPending}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Past */}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Past events
                <Badge variant="secondary">{past.length}</Badge>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {past.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onRsvp={(attending) =>
                      rsvpMutation.mutate({ id: event.id, attending })
                    }
                    pending={rsvpMutation.isPending}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EventCard({
  event,
  onRsvp,
  pending,
}: {
  event: EventItem;
  onRsvp: (attending: boolean) => void;
  pending: boolean;
}) {
  const fillPct = Math.min(100, Math.round((event.registered / event.capacity) * 100));
  return (
    <Card className={cn(event.past && "opacity-80")}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Badge className={cn("border-transparent", TYPE_COLOR[event.type])}>
              {TYPE_LABELS[event.type]}
            </Badge>
            <p className="mt-2 font-semibold text-foreground">{event.title}</p>
          </div>
          {event.rsvped && !event.past && (
            <Badge variant="success" dot>
              Going
            </Badge>
          )}
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">
          {event.description}
        </p>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDateTime(event.startAt)}
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {event.location}
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {event.registered}/{event.capacity} registered
          </div>
        </div>

        {event.past ? (
          event.recordingUrl ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => window.open(event.recordingUrl, "_blank")}
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Watch recording
            </Button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              No recording available
            </p>
          )
        ) : (
          <>
            <Progress value={fillPct} className="h-1.5" />
            <div className="flex gap-2">
              {event.rsvped ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => onRsvp(false)}
                >
                  Cancel RSVP
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={pending || fillPct >= 100}
                  onClick={() => onRsvp(true)}
                >
                  RSVP
                </Button>
              )}
              {event.meetingLink && event.rsvped && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a href={event.meetingLink} target="_blank" rel="noreferrer">
                    <Video className="h-3.5 w-3.5" />
                    Join
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
