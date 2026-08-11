import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Auto-cleanup DOM between tests.
afterEach(() => {
  cleanup();
});

// Stable window APIs that jsdom doesn't ship.
beforeAll(() => {
  // matchMedia — used by use-mobile hook.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  // SpeechSynthesis — used by use-speech hook.
  if (!("speechSynthesis" in window)) {
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: () => {},
        cancel: () => {},
        pending: false,
        speaking: false,
        paused: false,
        onvoiceschanged: null,
        getVoices: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      writable: true,
    });
  }
  if (typeof SpeechSynthesisUtterance === "undefined") {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        constructor(public text: string) {}
      },
      writable: true,
    });
  }

  // IntersectionObserver — used by Radix primitives.
  if (!("IntersectionObserver" in window)) {
    Object.defineProperty(window, "IntersectionObserver", {
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
      writable: true,
    });
  }

  // ResizeObserver — used by ScrollArea.
  if (!("ResizeObserver" in window)) {
    Object.defineProperty(window, "ResizeObserver", {
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
      writable: true,
    });
  }
});

// Mock sonner toasts — they call into the DOM and are noisy in tests.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  Toaster: () => null,
}));
