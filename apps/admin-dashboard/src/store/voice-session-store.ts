"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { VoiceCall } from "@/types/domain";
import { logAudit } from "@/store/audit-store";

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Past-call seed data matching the recentCalls mock list. */
const SEED_HISTORY: VoiceCall[] = [
  {
    id: "call_seed_rahul",
    state: "ended",
    direction: "inbound",
    customerName: "Rahul Sharma",
    customerPhone: "+91 98200 41122",
    assistantId: "ast_sarah",
    startedAt: "2026-03-15T10:30:00.000Z",
    endedAt: "2026-03-15T10:33:12.000Z",
    durationSeconds: 192,
    outcome: "Resolved",
  },
  {
    id: "call_seed_meera",
    state: "ended",
    direction: "outbound",
    customerName: "Meera Iyer",
    customerPhone: "+91 99870 55210",
    assistantId: "ast_priya",
    startedAt: "2026-03-15T09:10:00.000Z",
    endedAt: "2026-03-15T09:15:44.000Z",
    durationSeconds: 344,
    outcome: "Order placed",
  },
  {
    id: "call_seed_imran",
    state: "ended",
    direction: "inbound",
    customerName: "Imran Qureshi",
    customerPhone: "+91 91450 77390",
    assistantId: "ast_sarah",
    startedAt: "2026-03-15T08:42:00.000Z",
    endedAt: "2026-03-15T08:43:08.000Z",
    durationSeconds: 68,
    outcome: "Human transfer",
  },
  {
    id: "call_seed_divya",
    state: "ended",
    direction: "inbound",
    customerName: "Divya Menon",
    customerPhone: "+91 90040 22118",
    assistantId: "ast_sarah",
    startedAt: "2026-03-15T07:20:00.000Z",
    endedAt: "2026-03-15T07:20:22.000Z",
    durationSeconds: 22,
    outcome: "No response",
  },
  {
    id: "call_seed_sameer",
    state: "ended",
    direction: "outbound",
    customerName: "Sameer Joshi",
    customerPhone: "+91 98330 11908",
    assistantId: "ast_sarah",
    startedAt: "2026-03-14T18:00:00.000Z",
    endedAt: "2026-03-14T18:04:31.000Z",
    durationSeconds: 271,
    outcome: "Appointment booked",
  },
];

interface StartCallParams {
  customerName: string;
  customerPhone: string;
  assistantId: string;
}

interface VoiceSessionState {
  activeCall: VoiceCall | null;
  callHistory: VoiceCall[];
  startCall: (params: StartCallParams) => VoiceCall;
  tick: () => void;
  endCall: () => void;
  failCall: (reason: string) => void;
}

function computeDurationSeconds(startedAt: string | null): number {
  if (!startedAt) return 0;
  const delta = Date.now() - new Date(startedAt).getTime();
  return Math.max(0, Math.round(delta / 1000));
}

export const useVoiceSessionStore = create<VoiceSessionState>()(
  persist(
    (set, get) => ({
      activeCall: null,
      callHistory: SEED_HISTORY,
      startCall: ({ customerName, customerPhone, assistantId }) => {
        const now = new Date().toISOString();
        const call: VoiceCall = {
          id: genId("call"),
          state: "connecting",
          direction: "outbound",
          customerName,
          customerPhone,
          assistantId,
          startedAt: now,
          endedAt: null,
          durationSeconds: 0,
          outcome: null,
        };
        set({ activeCall: call });
        logAudit({
          action: "INSERT",
          resourceType: "voice",
          resourceId: call.id,
          resourceName: customerName,
          newValues: {
            state: call.state,
            direction: call.direction,
            customerPhone,
            assistantId,
          },
        });
        return call;
      },
      tick: () => {
        const call = get().activeCall;
        if (!call) return;
        let nextState: VoiceCall["state"] = call.state;
        if (call.state === "connecting") nextState = "connected";
        else if (call.state === "connected") nextState = "active";
        else if (call.state === "ending") nextState = "ended";
        else return; // active or terminal — no further advancement
        const next: VoiceCall = {
          ...call,
          state: nextState,
          durationSeconds: computeDurationSeconds(call.startedAt),
        };
        // If we just reached "ended", push to history and clear activeCall.
        if (nextState === "ended") {
          const ended: VoiceCall = {
            ...next,
            endedAt: new Date().toISOString(),
            outcome: next.outcome ?? "Completed",
          };
          set((s) => ({
            activeCall: null,
            callHistory: [ended, ...s.callHistory],
          }));
          logAudit({
            action: "UPDATE",
            resourceType: "voice",
            resourceId: ended.id,
            resourceName: ended.customerName,
            oldValues: { state: call.state },
            newValues: {
              state: "ended",
              durationSeconds: ended.durationSeconds,
              outcome: ended.outcome,
            },
          });
        } else {
          set({ activeCall: next });
        }
      },
      endCall: () => {
        const call = get().activeCall;
        if (!call) return;
        // Transition to "ending" first — the UI may show this briefly before tick()
        // pushes it to history. For a synchronous single-call flow, we also push
        // directly to history so the call is finalised even without a follow-up tick.
        const now = new Date().toISOString();
        const durationSeconds = computeDurationSeconds(call.startedAt);
        const ended: VoiceCall = {
          ...call,
          state: "ended",
          endedAt: now,
          durationSeconds,
          outcome: call.outcome ?? (call.state === "failed" ? "Failed" : "Completed"),
        };
        set((s) => ({
          activeCall: null,
          callHistory: [ended, ...s.callHistory],
        }));
        logAudit({
          action: "UPDATE",
          resourceType: "voice",
          resourceId: ended.id,
          resourceName: ended.customerName,
          oldValues: { state: call.state, durationSeconds: call.durationSeconds },
          newValues: {
            state: "ended",
            durationSeconds,
            outcome: ended.outcome,
          },
        });
      },
      failCall: (reason) => {
        const call = get().activeCall;
        if (!call) return;
        const next: VoiceCall = {
          ...call,
          state: "failed",
          outcome: `Failed: ${reason}`,
          durationSeconds: computeDurationSeconds(call.startedAt),
        };
        set({ activeCall: next });
        logAudit({
          action: "UPDATE",
          resourceType: "voice",
          resourceId: next.id,
          resourceName: next.customerName,
          oldValues: { state: call.state },
          newValues: { state: "failed", reason },
        });
      },
    }),
    { name: "dayjoy_voice_sessions" },
  ),
);
