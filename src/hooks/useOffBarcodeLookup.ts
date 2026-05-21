import { useEffect, useRef, useState } from "react";
import { useToast } from "../context/ToastContext";
import type { Verified100Item } from "../context/Verified100Context";
import type { Verified100Row } from "../utils/verifiedTsv";
import { fetchOpenFoodFactsProduct } from "../utils/openFoodFacts";
import { offDataToFormValues } from "../utils/offFormFill";
import { findBestVerifiedForOff, type OffVerifiedLinkMeta } from "../utils/offCatalog";
import { stableId } from "../utils/verifiedTsv";

export type OffBarcodeFormSetters = {
  setName: (v: string) => void;
  setBrand: (v: string) => void;
  setCategory: (v: string) => void;
  setPer100Basis: (v: "g" | "ml") => void;
  setKcal100: (v: string) => void;
  setProt100: (v: string) => void;
  setCarb100: (v: string) => void;
  setFat100: (v: string) => void;
  setTotalWeightG: (v: string) => void;
  setUnitsPerPack: (v: string) => void;
  setUnitWeightG: (v: string) => void;
  setVerifiedPicked?: (v: boolean) => void;
  setVerifiedPickedSig?: (v: string | null) => void;
};

type Options = {
  barcodeDigits: string;
  enabled: boolean;
  skipLookup?: boolean;
  verifiedItems: Verified100Row[] | Verified100Item[];
  setters: OffBarcodeFormSetters;
};

export function useOffBarcodeLookup({
  barcodeDigits,
  enabled,
  skipLookup = false,
  verifiedItems,
  setters,
}: Options) {
  const { showToast } = useToast();
  const [offLoading, setOffLoading] = useState(false);
  const [verifiedLink, setVerifiedLink] = useState<OffVerifiedLinkMeta | null>(null);
  const lastFetchedRef = useRef<string | null>(null);
  const settersRef = useRef(setters);
  settersRef.current = setters;

  useEffect(() => {
    if (!enabled || skipLookup) return;
    if (barcodeDigits.length < 8) {
      lastFetchedRef.current = null;
      setVerifiedLink(null);
      return;
    }
    if (lastFetchedRef.current === barcodeDigits) return;

    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      void (async () => {
        setOffLoading(true);
        try {
          const res = await fetchOpenFoodFactsProduct(barcodeDigits);
          if (ctrl.signal.aborted) return;
          lastFetchedRef.current = barcodeDigits;

          if (!res.ok) {
            showToast("שגיאת רשת ב-Open Food Facts", "error");
            return;
          }
          if (!res.found) {
            showToast("לא נמצא ב-Open Food Facts — מלאי ידנית", "error");
            return;
          }

          const verifiedHit = findBestVerifiedForOff(verifiedItems, {
            name: res.data.productName,
            brand: res.data.brand || undefined,
          });

          if (verifiedHit) {
            const v = verifiedHit.item;
            setVerifiedLink({
              verifiedId: stableId(v.brand, v.name),
              verifiedName: v.name,
              verifiedBrand: v.brand,
              verifiedCategory: v.category,
              matchScore: verifiedHit.score,
              offName: res.data.productName.trim() || "ללא שם",
              offBrand: res.data.brand.trim() || undefined,
              nutritionFromVerified: true,
            });
          } else {
            setVerifiedLink(null);
          }

          const form = offDataToFormValues(res.data, verifiedHit?.item ?? null);
          const s = settersRef.current;
          s.setName(form.name);
          s.setBrand(form.brand);
          s.setCategory(form.category);
          s.setPer100Basis(form.per100Basis);
          s.setKcal100(form.kcal100);
          s.setProt100(form.prot100);
          s.setCarb100(form.carb100);
          s.setFat100(form.fat100);
          s.setTotalWeightG(form.totalWeightG);
          s.setUnitsPerPack(form.unitsPerPack);
          s.setUnitWeightG(form.unitWeightG);

          if (form.fromVerified && s.setVerifiedPicked && s.setVerifiedPickedSig) {
            const sig = `${form.name}|${form.brand}||`;
            s.setVerifiedPicked(true);
            s.setVerifiedPickedSig(sig);
            showToast("נמצא ב-OFF — תזונה מהמאגר המאומת", "success");
          } else {
            s.setVerifiedPicked?.(false);
            s.setVerifiedPickedSig?.(null);
            showToast("נמצא ב-Open Food Facts", "success");
          }
        } finally {
          if (!ctrl.signal.aborted) setOffLoading(false);
        }
      })();
    }, 450);

    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [barcodeDigits, enabled, skipLookup, verifiedItems, showToast]);

  return { offLoading, verifiedLink };
}
