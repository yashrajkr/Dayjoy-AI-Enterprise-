"use client";

import { motion } from "framer-motion";

/**
 * Animated typing indicator — three bouncing dots shown while the
 * assistant is composing a reply. Purely presentational.
 */
export function ChatTyping() {
  return (
    <div
      className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3"
      role="status"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-2 w-2 rounded-full bg-primary"
          animate={{
            scale: [0.6, 1, 0.6],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
      <span className="sr-only">Assistant is typing…</span>
    </div>
  );
}
