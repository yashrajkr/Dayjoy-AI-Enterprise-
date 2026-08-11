"use client";

import { ToastProvider, ToastViewport } from "./toast";

export function Toaster() {
  return (
    <ToastProvider>
      <ToastViewport />
    </ToastProvider>
  );
}
