import type { VoiceWizardStep } from "../components/VoiceDictationWizard";
import { extractSpokenNumber, normalizeKeywordsSpeech } from "../utils/voiceDictation";

export const PRODUCT_IDENTITY_VOICE_STEPS: VoiceWizardStep[] = [
  { id: "name", label: "שם מוצר" },
  {
    id: "shortName",
    label: "שם קצר ליומן",
    skippable: true,
    hint: "שם קצר לתצוגה ביומן — אפשר «דלג»",
  },
  { id: "brand", label: "מותג", skippable: true },
  { id: "category", label: "קטגוריה", skippable: true },
  {
    id: "keywords",
    label: "מילות חיפוש",
    skippable: true,
    hint: "מילים מופרדות בפסיק — אפשר לומר «פסיק» בין מילים",
    format: normalizeKeywordsSpeech,
  },
];

export function nutritionVoiceSteps(per100Basis: "g" | "ml"): VoiceWizardStep[] {
  const packLabel =
    per100Basis === "ml" ? "נפח כולל של האריזה (מ״ל)" : "משקל כולל של האריזה (גרם)";
  const unitLabel = per100Basis === "ml" ? "נפח יחידה (מ״ל)" : "משקל יחידה (גרם)";

  return [
    {
      id: "kcal100",
      label: "קלוריות ל-100 (קק״ל)",
      skippable: true,
      format: extractSpokenNumber,
    },
    {
      id: "prot100",
      label: "חלבון ל-100 (גרם)",
      skippable: true,
      format: extractSpokenNumber,
    },
    {
      id: "carb100",
      label: "פחמימות ל-100 (גרם)",
      skippable: true,
      format: extractSpokenNumber,
    },
    {
      id: "fat100",
      label: "שומן ל-100 (גרם)",
      skippable: true,
      format: extractSpokenNumber,
    },
    {
      id: "totalWeightG",
      label: packLabel,
      skippable: true,
      format: extractSpokenNumber,
    },
    {
      id: "unitsPerPack",
      label: "יחידות באריזה",
      skippable: true,
      format: extractSpokenNumber,
    },
    {
      id: "unitWeightG",
      label: unitLabel,
      skippable: true,
      format: extractSpokenNumber,
    },
  ];
}
