import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Options = {
  lang?: string;
  enabled?: boolean;
  onFinalPhrase?: (phrase: string) => void;
  onTranscript?: (full: string, interim: string) => void;
};

export function useSpeechRecognition({
  lang = "he-IL",
  enabled = true,
  onFinalPhrase,
  onTranscript,
}: Options) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListenRef = useRef(false);
  const sessionIdRef = useRef(0);
  const onFinalRef = useRef(onFinalPhrase);
  const onTranscriptRef = useRef(onTranscript);
  onFinalRef.current = onFinalPhrase;
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    sessionIdRef.current += 1;
    setListening(false);
    try { recRef.current?.abort(); } catch { /* ignore */ }
    recRef.current = null;
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || !enabled) {
      setError("הדפדפן לא תומך בהקלטה קולית");
      return;
    }
    setError(null);

    // Kill previous instance completely
    wantListenRef.current = false;
    sessionIdRef.current += 1;
    try { recRef.current?.abort(); } catch { /* ignore */ }
    recRef.current = null;

    // Small delay to let old instance finish dying before starting new one
    const mySession = sessionIdRef.current;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      if (sessionIdRef.current !== mySession) return;

      const finalParts: string[] = [];
      let interim = "";

      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          if (piece.trim()) finalParts.push(piece.trim());
        } else {
          interim += piece;
        }
      }

      // Only emit segments that became final in *this* event
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (!event.results[i].isFinal) continue;
        const piece = (event.results[i][0]?.transcript ?? "").trim();
        if (piece) onFinalRef.current?.(piece);
      }

      const full = [...finalParts, interim.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      onTranscriptRef.current?.(full, interim.replace(/\s+/g, " ").trim());
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (sessionIdRef.current !== mySession) return;
      if (ev.error === "aborted" || ev.error === "no-speech") return;
      setError(
        ev.error === "not-allowed"
          ? "אין הרשאת מיקרופון — אפשרי בהגדרות הדפדפן"
          : `שגיאת הקלטה: ${ev.error}`,
      );
    };

    rec.onend = () => {
      if (sessionIdRef.current !== mySession) return;
      setListening(false);
      if (wantListenRef.current) {
        try {
          rec.start();
          setListening(true);
        } catch {
          wantListenRef.current = false;
        }
      }
    };

    recRef.current = rec;
    wantListenRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("לא ניתן להפעיל מיקרופון");
      wantListenRef.current = false;
    }
  }, [enabled, lang]);

  useEffect(
    () => () => {
      wantListenRef.current = false;
      sessionIdRef.current += 1;
      try { recRef.current?.abort(); } catch { /* ignore */ }
    },
    [],
  );

  return { supported, listening, error, start, stop };
}
