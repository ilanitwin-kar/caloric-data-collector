import { useEffect, useMemo, useState } from "react";
import {
  verifiedItemToSuggestionPick,
  type VerifiedSuggestionPick,
} from "../components/verifiedSuggestionTypes";
import { useVerified100 } from "../context/Verified100Context";
import {
  buildCatalogEditSearchQuery,
  catalogEditPickSig,
  draftHasNutrition,
} from "../utils/catalogEditDraftApply";
import { verifiedRowToPickPortions } from "../utils/verifiedMeasures";
import { verifiedSearchQueryReady } from "../utils/verifiedSearch";

type DraftForSuggestions = {
  name: string;
  shortName: string;
  brand: string;
  keywords: string;
  category: string;
  per100Basis: "g" | "ml";
  calories100: string;
};

export function useCatalogEditSuggestions(
  productId: string | null,
  draft: DraftForSuggestions | null,
  enabled: boolean,
) {
  const { findScoredMatches } = useVerified100();
  const [verifiedSuggestions, setVerifiedSuggestions] = useState<VerifiedSuggestionPick[]>([]);
  const [mohSuggestions, setMohSuggestions] = useState<VerifiedSuggestionPick[]>([]);
  const [verifiedPicked, setVerifiedPicked] = useState(false);
  const [verifiedPickedSig, setVerifiedPickedSig] = useState<string | null>(null);
  const [mohPickedLabel, setMohPickedLabel] = useState<string | null>(null);
  const [mohDismissed, setMohDismissed] = useState(false);

  const searchQuery = useMemo(
    () => (draft ? buildCatalogEditSearchQuery(draft) : ""),
    [draft],
  );

  const pickSig = useMemo(() => (draft ? catalogEditPickSig(draft) : ""), [draft]);

  const nutritionReady = useMemo(
    () => (draft ? draftHasNutrition(draft) : false),
    [draft],
  );

  useEffect(() => {
    setVerifiedPicked(false);
    setVerifiedPickedSig(null);
    setMohPickedLabel(null);
    setMohDismissed(false);
    setVerifiedSuggestions([]);
    setMohSuggestions([]);
  }, [productId]);

  useEffect(() => {
    if (!enabled || !draft) {
      setVerifiedSuggestions([]);
      return;
    }
    if (draft.per100Basis === "ml") {
      setVerifiedSuggestions([]);
      return;
    }
    if (verifiedPickedSig && verifiedPickedSig === pickSig) {
      setVerifiedSuggestions([]);
      return;
    }
    if (!verifiedSearchQueryReady(searchQuery)) {
      setVerifiedSuggestions([]);
      return;
    }
    const scored = findScoredMatches(
      { name: searchQuery, brand: draft.brand.trim() || undefined },
      { limit: 10, source: "tsv" },
    );
    setVerifiedSuggestions(
      scored.map(({ item, score }) => verifiedItemToSuggestionPick(item, score, {})),
    );
  }, [
    draft,
    enabled,
    findScoredMatches,
    pickSig,
    searchQuery,
    verifiedPickedSig,
  ]);

  useEffect(() => {
    if (!enabled || !draft) {
      setMohSuggestions([]);
      return;
    }
    if (!nutritionReady || mohPickedLabel || mohDismissed) {
      setMohSuggestions([]);
      return;
    }
    if (draft.per100Basis === "ml") {
      setMohSuggestions([]);
      return;
    }
    if (!verifiedSearchQueryReady(searchQuery)) {
      setMohSuggestions([]);
      return;
    }
    const scored = findScoredMatches(
      { name: searchQuery, brand: draft.brand.trim() || undefined },
      { limit: 8, source: "ministry" },
    );
    setMohSuggestions(
      scored.map(({ item, score }) =>
        verifiedItemToSuggestionPick(item, score, verifiedRowToPickPortions(item)),
      ),
    );
  }, [
    draft,
    enabled,
    findScoredMatches,
    mohDismissed,
    mohPickedLabel,
    nutritionReady,
    searchQuery,
  ]);

  return {
    searchQuery,
    pickSig,
    nutritionReady,
    verifiedSuggestions,
    mohSuggestions,
    verifiedPicked,
    verifiedPickedSig,
    mohPickedLabel,
    setVerifiedPicked,
    setVerifiedPickedSig,
    setMohPickedLabel,
    setMohDismissed,
    dismissVerified: () => setVerifiedSuggestions([]),
    dismissMoh: () => {
      setMohDismissed(true);
      setMohSuggestions([]);
    },
    clearMohPicked: () => {
      setMohPickedLabel(null);
      setMohDismissed(false);
    },
    clearVerifiedPicked: () => {
      setVerifiedPicked(false);
      setVerifiedPickedSig(null);
    },
    onMohApproved: (sug: VerifiedSuggestionPick) => {
      setMohPickedLabel(sug.name);
      setMohSuggestions([]);
    },
    onVerifiedPicked: () => {
      setVerifiedPicked(true);
      setVerifiedPickedSig(pickSig);
      setVerifiedSuggestions([]);
    },
  };
}
