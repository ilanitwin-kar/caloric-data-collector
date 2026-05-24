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
  const onFinalRef = useRef(onFinalPhrase);
  const onTranscriptRef = useRef(onTranscript);
  onFinalRef.current = onFinalPhrase;
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    setListening(false);
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || !enabled) {
      setError("הדפדפן לא תומך בהקלטה קולית");
      return;
    }
    setError(null);
    wantListenRef.current = true;

    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch {
        /* ignore */
      }
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      const finals: string[] = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          finals.push(piece);
          onFinalRef.current?.(piece);
        } else {
          interim += piece;
        }
      }
      const full = [...finals, interim].join(" ").replace(/\s+/g, " ").trim();
      onTranscriptRef.current?.(full, interim.trim());
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === "aborted" || ev.error === "no-speech") return;
      setError(
        ev.error === "not-allowed"
          ? "אין הרשאת מיקרופון — אפשרי בהגדרות הדפדפן"
          : `שגיאת הקלטה: ${ev.error}`,
      );
    };

    rec.onend = () => {
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
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("לא ניתן להפעיל מיקרופון");
      wantListenRef.current = false;
    }
  }, [enabled, lang]);

  useEffect(() => () => {
    wantListenRef.current = false;
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
  }, []);

  return { supported, listening, error, start, stop };
}
