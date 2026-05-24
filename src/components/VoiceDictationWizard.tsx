import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import {
  cleanVoiceUtterance,
  voiceSaysAdvance,
  voiceSaysSkip,
} from "../utils/voiceDictation";

export type VoiceWizardStep = {
  id: string;
  label: string;
  hint?: string;
  skippable?: boolean;
  format?: (raw: string) => string;
};

type VoiceDictationWizardProps = {
  open: boolean;
  title: string;
  steps: VoiceWizardStep[];
  onClose: () => void;
  onApply: (stepId: string, value: string) => void;
  onFinish: () => void;
};

export function VoiceDictationWizard({
  open,
  title,
  steps,
  onClose,
  onApply,
  onFinish,
}: VoiceDictationWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const stepTranscriptRef = useRef("");

  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;

  const resetStep = useCallback(() => {
    stepTranscriptRef.current = "";
    setTranscript("");
  }, []);

  const confirmStep = useCallback(
    (raw: string, skipped: boolean) => {
      if (!step) return;
      if (!skipped) {
        const formatted = step.format ? step.format(raw) : cleanVoiceUtterance(raw);
        if (!formatted && !step.skippable) return;
        if (formatted) onApply(step.id, formatted);
      }
      if (isLast) {
        onFinish();
        onClose();
        setStepIndex(0);
        resetStep();
        return;
      }
      setStepIndex((i) => i + 1);
      resetStep();
    },
    [isLast, onApply, onClose, onFinish, resetStep, step],
  );

  const handleFinalPhrase = useCallback(
    (phrase: string) => {
      const trimmed = phrase.trim();
      if (!trimmed) return;

      if (voiceSaysSkip(trimmed)) {
        if (step?.skippable) confirmStep("", true);
        return;
      }

      const piece = cleanVoiceUtterance(trimmed);
      if (piece) {
        stepTranscriptRef.current = [stepTranscriptRef.current, piece]
          .filter(Boolean)
          .join(" ")
          .trim();
        setTranscript(stepTranscriptRef.current);
      }

      if (voiceSaysAdvance(trimmed)) {
        confirmStep(stepTranscriptRef.current, false);
      }
    },
    [confirmStep, step?.skippable],
  );

  const { supported, listening, error, start, stop } = useSpeechRecognition({
    enabled: open,
    onFinalPhrase: handleFinalPhrase,
    onTranscript: (full) => {
      if (full) setTranscript(full);
    },
  });

  useEffect(() => {
    if (!open) {
      stop();
      setStepIndex(0);
      resetStep();
      return;
    }
    resetStep();
    const t = window.setTimeout(() => start(), 200);
    return () => {
      window.clearTimeout(t);
      stop();
    };
  }, [open, start, stop, resetStep]);

  useEffect(() => {
    if (!open) return;
    resetStep();
    start();
  }, [open, stepIndex, resetStep, start]);

  const handleClose = () => {
    stop();
    onClose();
  };

  if (!open || !step) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-emerald-400/30 bg-neutral-950/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md"
      dir="rtl"
      role="dialog"
      aria-labelledby="voice-wizard-title"
    >
      <div className="mx-auto max-w-lg space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p id="voice-wizard-title" className="text-sm font-semibold text-emerald-50">
              {title}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              שלב {stepIndex + 1}/{steps.length}:{" "}
              <span className="text-white">{step.label}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-white/15 px-2.5 py-1 text-sm font-semibold text-ink-muted hover:text-white"
          >
            סגור
          </button>
        </div>

        {step.hint ? (
          <p className="text-sm leading-relaxed text-ink-dim">{step.hint}</p>
        ) : null}

        {!supported ? (
          <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            הקלטה קולית לא נתמכת בדפדפן זה. נסי Chrome ב-Android או Chrome ב-desktop.
          </p>
        ) : null}

        <div className="min-h-[56px] rounded-xl border border-white/15 bg-black/40 px-3 py-2.5">
          <p className="text-base leading-relaxed text-white">
            {transcript || (
              <span className="text-ink-dim">מקשיב… אמרי «{step.label}», ואז «הבא» או ✓</span>
            )}
          </p>
        </div>

        <p className="text-sm text-ink-dim">
          {listening ? (
            <span className="text-emerald-300">● מקשיב</span>
          ) : (
            <span>מיקרופון כבוי</span>
          )}
          {" · "}
          אמרי «הבא» או לחצי ✓
          {step.skippable ? " · «דלג» לדילוג" : null}
        </p>

        {error ? (
          <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {step.skippable ? (
            <button
              type="button"
              onClick={() => confirmStep("", true)}
              className="min-h-[48px] rounded-xl border border-white/15 px-4 text-sm font-semibold text-ink-muted hover:border-white/25 hover:text-white"
            >
              דלג
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => confirmStep(transcript || stepTranscriptRef.current, false)}
            className="min-h-[48px] flex-1 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black hover:bg-emerald-400"
          >
            ✓ הבא
          </button>
        </div>
      </div>
    </div>
  );
}
