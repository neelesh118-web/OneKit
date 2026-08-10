/**
 * Dictation — wraps the Web Speech API (SpeechRecognition) so the content
 * script can dictate into any field. Recognition runs entirely in the
 * browser; audio never leaves the device.
 */

export interface DictationCallbacks {
  onResult: (finalText: string, interimText: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface DictationHandle {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

export function speechRecognitionAvailable(): boolean {
  const w = globalThis as unknown as Record<string, unknown>;
  return typeof w.SpeechRecognition === "function" || typeof w.webkitSpeechRecognition === "function";
}

function RecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = globalThis as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return ctor ?? null;
}

/** Creates and configures a recognizer. Returns null when unsupported. */
export function createRecognizer(callbacks: DictationCallbacks): DictationHandle | null {
  const Ctor = RecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  rec.onresult = (event: unknown) => {
    const ev = event as {
      resultIndex?: number;
      results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
    };
    let interim = "";
    const results = ev.results;
    if (!results) return;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const alt = result?.[0];
      const transcript = alt?.transcript ?? "";
      if (result && "isFinal" in result && (result as { isFinal?: boolean }).isFinal) {
        finalText += transcript;
      } else {
        interim += transcript;
      }
    }
    callbacks.onResult(finalText, interim);
  };
  rec.onend = () => {
    callbacks.onEnd();
  };
  rec.onerror = (event) => {
    const map: Record<string, string> = {
      "not-allowed": "Microphone permission denied — allow the mic to use dictation.",
      "no-speech": "No speech detected — try again.",
      "network": "Speech recognition unavailable (needs a network connection).",
      "aborted": "Dictation stopped."
    };
    callbacks.onError(map[event.error ?? ""] ?? `Dictation error: ${event.error ?? "unknown"}`);
  };

  return {
    start: () => {
      try {
        rec.start();
      } catch {
        callbacks.onError("Could not start dictation.");
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        // Already stopped.
      }
    },
    abort: () => {
      try {
        rec.abort();
      } catch {
        // Already stopped.
      }
    }
  };
}
