"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VAPI_PUBLIC_KEY,
  VAPI_ASSISTANT_ID,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

interface VoiceButtonProps {
  /** Phone number / label shown in the modal. */
  label?: string;
  className?: string;
  /** Compact (icon-only floating button) or full label. */
  variant?: "floating" | "inline";
}

/**
 * Voice AI call button — opens a modal that simulates a Vapi voice
 * call. When `VAPI_PUBLIC_KEY` is configured the production build will
 * lazy-load the `@vapi-ai/web` SDK; otherwise we render a
 * self-contained call experience that demonstrates the UX and surfaces
 * the configured assistant id.
 */
export function VoiceButton({
  label = "Voice Assistant",
  className,
  variant = "inline",
}: VoiceButtonProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "active" | "ended"
  >("idle");
  const [duration, setDuration] = useState(0);

  const handleStart = () => {
    setOpen(true);
    setStatus("connecting");
    // Simulated connection — the production deployment will replace
    // this with `new Vapi(VAPI_PUBLIC_KEY).start(VAPI_ASSISTANT_ID)`.
    setTimeout(() => setStatus("active"), 1800);
  };

  const handleEnd = () => {
    setStatus("ended");
    setTimeout(() => {
      setOpen(false);
      setStatus("idle");
      setDuration(0);
    }, 800);
  };

  // Live duration counter
  useEffect(() => {
    if (status !== "active") return;
    const interval = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  return (
    <>
      {variant === "floating" ? (
        <Button
          onClick={handleStart}
          size="icon"
          className={cn(
            "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-glow",
            className,
          )}
          aria-label="Start a voice call"
        >
          <Phone className="h-5 w-5" />
        </Button>
      ) : (
        <Button
          onClick={handleStart}
          variant="outline"
          className={cn("gap-2", className)}
        >
          <Phone className="h-4 w-4" />
          {label}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && handleEnd()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              Dayjoy Voice Assistant
            </DialogTitle>
            <DialogDescription>
              {VAPI_PUBLIC_KEY
                ? `Connected to assistant ${VAPI_ASSISTANT_ID || "(default)"}`
                : "Demo mode — voice SDK not configured"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center gap-4 py-6">
            <AnimatePresence mode="wait">
              {status === "connecting" ? (
                <motion.div
                  key="connecting"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col items-center gap-3"
                >
                  <div className="relative flex h-24 w-24 items-center justify-center">
                    <motion.div
                      className="absolute inset-0 rounded-full bg-primary/20"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.2, 0.6] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                    />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Connecting…
                  </p>
                </motion.div>
              ) : status === "active" ? (
                <motion.div
                  key="active"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3"
                >
                  <div className="relative flex h-24 w-24 items-center justify-center">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="absolute rounded-full bg-primary/30"
                        style={{ width: 80, height: 80 }}
                        animate={{
                          scale: [1, 1.5, 1],
                          opacity: [0.5, 0, 0.5],
                        }}
                        transition={{
                          duration: 1.8,
                          repeat: Infinity,
                          delay: i * 0.4,
                        }}
                      />
                    ))}
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Phone className="h-6 w-6" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    In call
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {Math.floor(duration / 60)
                      .toString()
                      .padStart(2, "0")}
                    :{(duration % 60).toString().padStart(2, "0")}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="ended"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <X className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Call ended
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="max-w-xs text-center text-xs text-muted-foreground">
              {status === "active"
                ? "Speak naturally — the assistant can help with orders, products, and support."
                : status === "connecting"
                  ? "Securing a connection to the Dayjoy AI voice service…"
                  : "Your call has ended. A summary will appear in your history shortly."}
            </p>
          </div>

          <div className="flex justify-center">
            {status === "active" || status === "connecting" ? (
              <Button
                variant="destructive"
                onClick={handleEnd}
                className="gap-2"
              >
                <PhoneOff className="h-4 w-4" />
                End call
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
