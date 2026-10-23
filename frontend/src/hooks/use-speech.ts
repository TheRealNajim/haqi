import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin wrapper around the browser SpeechRecognition API.
 *
 * - `supported` is false in browsers that only expose vendor-prefixed (or no)
 *   speech recognition; the UI must say so rather than fake a recording.
 * - Results are streamed through `onTranscript`; `isFinal` is true once the
 *   browser has committed the phrase.
 */

type SpeechAlternative = { transcript: string; confidence: number };
type SpeechResult = {
  isFinal: boolean;
  length: number;
  0: SpeechAlternative;
  [index: number]: SpeechAlternative;
};
type SpeechResultList = { length: number; [index: number]: SpeechResult };

type SpeechResultEventLike = {
  resultIndex: number;
  results: SpeechResultList;
};

type SpeechErrorEventLike = {
  error: string;
  message?: string;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function errorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow it in your browser settings and try again.";
    case "no-speech":
      return "No speech was detected. Try again and speak a little closer to the mic.";
    case "audio-capture":
      return "No microphone was found. Check that one is connected and available.";
    case "network":
      return "Voice recognition needs a network connection in this browser.";
    case "language-not-supported":
      return "Voice recognition does not support your language in this browser.";
    case "aborted":
      return "";
    default:
      return "Voice input stopped unexpectedly. Please try again.";
  }
}

type UseSpeechInputOptions = {
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
};

export function useSpeechInput({ onTranscript, onError }: UseSpeechInputOptions) {
  const [supported] = useState(() => Boolean(getRecognitionConstructor()));
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const callbacks = useRef({ onTranscript, onError });

  useEffect(() => {
    callbacks.current = { onTranscript, onError };
  }, [onTranscript, onError]);

  const start = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      callbacks.current.onError?.(
        "Voice input is not supported in this browser. Try Chrome or Edge.",
      );
      return;
    }
    if (recognitionRef.current) return;

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language?.toLowerCase().startsWith("en")
      ? navigator.language
      : "en-NG";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      const parts: string[] = [];
      let isFinal = true;
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (transcript) parts.push(transcript);
        if (!result.isFinal) isFinal = false;
      }
      callbacks.current.onTranscript(parts.join(" ").trim(), isFinal);
    };

    recognition.onerror = (event) => {
      setListening(false);
      recognitionRef.current = null;
      const message = errorMessage(event.error);
      if (message) callbacks.current.onError?.(message);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      callbacks.current.onError?.("Voice input is already active. Stop it and try again.");
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return { supported, listening, start, stop };
}
