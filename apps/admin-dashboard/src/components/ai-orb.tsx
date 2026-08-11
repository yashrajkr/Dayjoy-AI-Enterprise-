"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AiOrbProps {
  size?: number;
  className?: string;
  /** Show the slow-rotating conic ring around the orb. Off for the small topbar echo. */
  ring?: boolean;
}

/**
 * AiOrb — the platform's signature element: a breathing aurora-gradient
 * core representing "the model is here, thinking." Used once at hero scale
 * (login) and once small (topbar status). Not reused as generic decoration
 * elsewhere, so it keeps its meaning.
 */
export function AiOrb({ size = 220, ring = true, className }: AiOrbProps) {
  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {ring && (
        <div
          className="absolute inset-0 animate-orb-rotate rounded-full opacity-60"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0%, hsl(var(--cyan)) 20%, transparent 40%, hsl(var(--indigo)) 65%, transparent 85%)",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))",
          }}
        />
      )}
      <motion.div
        className="absolute rounded-full bg-aurora-radial blur-2xl"
        style={{ width: size * 0.9, height: size * 0.9 }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="relative rounded-full bg-aurora shadow-glow"
        style={{ width: size * 0.42, height: size * 0.42 }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
