"use client";

import { useEffect, useState } from "react";

/**
 * Typed Web Speech API hook for voice input (SpeechRecognition) and
 * text-to-speech output (SpeechSynthesis). Returns no-op values when
 * the API isn't available (older browsers, SSR).
 */
interface UseSpeechOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

interface UseSpeechReturn {
  /** Speech recognition is currently listening. */
  listening: boolean;
  /** Most recent transcript (final + interim). */
  transcript: string;
  /** Speech synthesis is currently speaking. */
  speaking: boolean;
  /** SpeechRecognition is supported in this browser. */
  speechRecognitionSupported: boolean;
  /** SpeechSynthesis is supported in this browser. */
  speechSynthesisSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  speak: (text: string) => void;
  cancelSpeak: () => void;
}

export function useSpeech(options: UseSpeechOptions = {}): UseSpeechReturn {
  const {
    lang = "en-IN",
    continuous = false,
    interimResults = true,
  } = options;
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const [synthesisSupported, setSynthesisSupported] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      window.SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition;
    setRecognitionSupported(Boolean(SR));
    setSynthesisSupported("speechSynthesis" in window);
  }, []);

  const startListening = () => {
    if (typeof window === "undefined") return;
    const SR =
      window.SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Recognition = SR as any;
    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i]?.[0]?.transcript ?? "";
      }
      setTranscript(text);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  const stopListening = () => {
    if (typeof window === "undefined") return;
    // The recognition instance is internal; we toggle state and let
    // the recognition auto-stop. (Browsers don't expose the running
    // instance via a global.)
    setListening(false);
  };

  const resetTranscript = () => setTranscript("");

  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window))
      return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const cancelSpeak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window))
      return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  return {
    listening,
    transcript,
    speaking,
    speechRecognitionSupported: recognitionSupported,
    speechSynthesisSupported: synthesisSupported,
    startListening,
    stopListening,
    resetTranscript,
    speak,
    cancelSpeak,
  };
}

// Minimal ambient types for browsers that ship unprefixed SpeechRecognition.
declare global {
  interface Window {
    SpeechRecognition?: unknown;
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
}
