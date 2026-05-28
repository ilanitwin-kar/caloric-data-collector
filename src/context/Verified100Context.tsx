import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onValue, ref, update, type DataSnapshot } from "firebase/database";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import {
  normalizeText,
  parseVerifiedTsv,
  scoreVerifiedMatch,
  stableId,
  VERIFIED_AUTO_APPLY_MIN_SCORE,
  type Verified100Row,
} from "../utils/verifiedTsv";
import { fetchMinistryVerifiedRows, ministryKindSortPenalty } from "../utils/ministryNutrition";
import type { MinistryFoodKind } from "../utils/ministryNutrition";
import { verifiedHasPortions } from "../utils/verifiedMeasures";

export type Verified100Item = Verified100Row & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type Match = { item: Verified100Item; score: number };

type Verified100ContextValue = {
  items: Verified100Item[];
  loading: boolean;
  error: string | null;
  cloudSyncPaused: boolean;
  pauseCloudSync: () => void;
  resumeCloudSync: () => void;
  importTsv: (file: File) => Promise<void>;
  removeDuplicates: () => Promise<{ removed: number }>;
  syncFromMinistry: (opts?: { signal?: AbortSignal }) => Promise<{ written: number; enriched: number }>;
  findBestMatch: (q: { name: string; brand?: string }) => Verified100Item | null;
  findMatches: (q: { name: string; brand?: string }, opts?: { limit?: number }) => Verified100Item[];
  findScoredMatches: (
    q: { name: string; brand?: string },
    opts?: {
      limit?: number;
      source?: "all" | "tsv" | "ministry";
      excludeKinds?: MinistryFoodKind[];
      kindsOnly?: MinistryFoodKind[];
    },
  ) => Array<{ item: Verified100Item; score: number }>;
};

const Ctx = createContext<Verified100ContextValue | null>(null);

function cleanForRtdb<T>(value: T): T {
  // RTDB rejects `undefined` anywhere in the payload.
  // JSON stringify drops undefined object keys (and would turn undefined array items into null,
  // but we don't use arrays in the payload). Keeps payload deterministic and safe for update().
  return JSON.parse(JSON.stringify(value)) as T;
}

function decodeCp862(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    if (b >= 0x80 && b <= 0x9a) {
      out += String.fromCharCode(0x05d0 + (b - 0x80));
    } else {
      out += String.fromCharCode(b);
    }
  }
  return out;
}

function looksHebrew(text: string): boolean {
  return /[\u05d0-\u05ea]/.test(text.slice(0, 200));
}

async function readFileTextWithFallback(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  // Try CP862 first (DOS Hebrew) — bytes 0x80-0x9A map to א-ת
  if (bytes.some((b) => b >= 0x80 && b <= 0x9a)) {
    const cp862 = decodeCp862(bytes);
    if (looksHebrew(cp862)) return cp862;
  }

  const decoders = ["utf-8", "windows-1255", "utf-16le"] as const;
  for (const enc of decoders) {
    try {
      const text = new TextDecoder(enc).decode(bytes);
      if (text.trim().length > 0) return text;
    } catch {
      // Try next encoding.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function Verified100Provider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<Verified100Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stuckHint, setStuckHint] = useState<string | null>(null);
  const [cloudSyncPaused, setCloudSyncPaused] = useState(false);

  const pauseCloudSync = useCallback(() => {
    setCloudSyncPaused(true);
    setLoading(false);
  }, []);

  const resumeCloudSync = useCallback(() => {
    setCloudSyncPaused(false);
    setStuckHint(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      setError(null);
      setStuckHint(null);
      setCloudSyncPaused(false);
      return;
    }
    if (cloudSyncPaused) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setStuckHint(null);
    const path = `users/${user.uid}/verified100/items`;
    console.info("[Verified100] listening:", path, "uid:", user.uid);
    const r = ref(db, path);
    let gotData = false;
    const stuckTimer = window.setTimeout(() => {
      if (!gotData) {
        console.warn("[Verified100] stuck – no data after 12s");
        setStuckHint(
          "הטעינה מהענן נמשכת יותר מדי זמן. בדקי חיבור לאינטרנט, רענני את העמוד, או נקי קאש של האפליקציה (PWA).",
        );
      }
    }, 12000);
    const unsub = onValue(
      r,
      (snap: DataSnapshot) => {
        gotData = true;
        window.clearTimeout(stuckTimer);
        const v = snap.val() as Record<string, Verified100Item> | null;
        const list = v ? Object.values(v) : [];
        console.info("[Verified100] got data:", list.length, "items");
        setItems(list);
        setError(null);
        setLoading(false);
        setStuckHint(null);
      },
      (err) => {
        gotData = true;
        window.clearTimeout(stuckTimer);
        console.error("[Verified100] error:", err.message);
        setError(err.message);
        setLoading(false);
        setStuckHint(null);
      },
    );
    return () => {
      window.clearTimeout(stuckTimer);
      unsub();
    };
  }, [user, cloudSyncPaused]);

  // Auto-import from bundled CSV when Firebase is empty
  const [autoImportDone, setAutoImportDone] = useState(false);
  useEffect(() => {
    if (loading || !user || autoImportDone || items.length > 0) return;
    setAutoImportDone(true);
    console.info("[Verified100] Firebase empty – auto-importing from /my_food_db.csv");
    (async () => {
      try {
        const res = await fetch("/my_food_db.csv", { cache: "no-store" });
        if (!res.ok) {
          console.warn("[Verified100] auto-import fetch failed:", res.status);
          return;
        }
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let text: string;
        if (bytes.some((b) => b >= 0x80 && b <= 0x9a)) {
          const cp862 = decodeCp862(bytes);
          text = looksHebrew(cp862) ? cp862 : new TextDecoder("windows-1255").decode(bytes);
        } else {
          text = new TextDecoder("windows-1255").decode(bytes);
        }
        const rows = parseVerifiedTsv(text);
        if (rows.length === 0) return;
        const now = new Date().toISOString();
        const chunkSize = 200;
        const basePath = `users/${user.uid}/verified100/items`;
        const baseRef = ref(db, basePath);
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const updates: Record<string, unknown> = {};
          for (const row of chunk) {
            const id = stableId(row.brand, row.name);
            const item: Verified100Item = {
              id,
              name: row.name,
              createdAt: now,
              updatedAt: now,
              ...(row.category ? { category: row.category } : {}),
              ...(row.brand ? { brand: row.brand } : {}),
              ...(typeof row.protein100 === "number" && Number.isFinite(row.protein100) ? { protein100: row.protein100 } : {}),
              ...(typeof row.fat100 === "number" && Number.isFinite(row.fat100) ? { fat100: row.fat100 } : {}),
              ...(typeof row.carbs100 === "number" && Number.isFinite(row.carbs100) ? { carbs100: row.carbs100 } : {}),
              ...(typeof row.calories100 === "number" && Number.isFinite(row.calories100) ? { calories100: row.calories100 } : {}),
            };
            updates[id] = JSON.parse(JSON.stringify(item));
          }
          await update(baseRef, updates);
        }
        showToast(`יובאו ${rows.length.toLocaleString("he-IL")} מוצרים מאומתים (אוטומטי)`, "success");
        console.info("[Verified100] auto-import done:", rows.length, "items");
      } catch (e) {
        console.error("[Verified100] auto-import error:", e);
      }
    })();
  }, [loading, user, items.length, autoImportDone, showToast]);

  const importTsv = useCallback(
    async (file: File) => {
      if (!user) {
        showToast("צריך להתחבר כדי לייבא", "error");
        return;
      }
      try {
        showToast("מייבא מאגר מאומת…", "success");
        const text = await readFileTextWithFallback(file);
        const rows = parseVerifiedTsv(text);
        if (rows.length === 0) {
          showToast("לא זוהו נתונים בקובץ", "error");
          return;
        }

        const now = new Date().toISOString();
        // Keep chunks small to avoid RTDB payload limits (~16MB) and reduce chance of write rejection.
        const chunkSize = 200;
        let imported = 0;
        const basePath = `users/${user.uid}/verified100/items`;
        const baseRef = ref(db, basePath);

        // Write in chunks so large files won't fail due to payload limits.
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const updates: Record<string, unknown> = {};
          for (const row of chunk) {
            const id = stableId(row.brand, row.name);
            // Update relative to basePath; avoids "root update" edge-cases with rules.
            // Do NOT spread `row` because RTDB rejects any `undefined` values.
            const base: Verified100Item = {
              id,
              name: row.name,
              createdAt: now,
              updatedAt: now,
            };
            const item: Verified100Item = {
              ...base,
              ...(row.category ? { category: row.category } : {}),
              ...(row.brand ? { brand: row.brand } : {}),
              ...(typeof row.protein100 === "number" && Number.isFinite(row.protein100)
                ? { protein100: row.protein100 }
                : {}),
              ...(typeof row.fat100 === "number" && Number.isFinite(row.fat100)
                ? { fat100: row.fat100 }
                : {}),
              ...(typeof row.carbs100 === "number" && Number.isFinite(row.carbs100)
                ? { carbs100: row.carbs100 }
                : {}),
              ...(typeof row.calories100 === "number" && Number.isFinite(row.calories100)
                ? { calories100: row.calories100 }
                : {}),
            };

            // Extra safety: strip any lingering undefineds.
            const safeItem = cleanForRtdb(item);
            updates[id] = safeItem;
          }
          await update(baseRef, updates);
          imported += chunk.length;
        }

        showToast(`יובאו ${imported.toLocaleString("he-IL")} מוצרים מאומתים`, "success");
      } catch (e) {
        const message =
          e instanceof Error && e.message ? e.message : "שגיאה לא ידועה בזמן ייבוא";
        showToast(`ייבוא נכשל: ${message}`, "error");
      }
    },
    [user, showToast],
  );

  const removeDuplicates = useCallback(async () => {
    if (!user) {
      showToast("יש להתחבר כדי לנקות כפילויות", "error");
      return { removed: 0 };
    }
    try {
      // Score an item by how "complete" it is, so we keep the richest copy.
      const completeness = (it: Verified100Item) => {
        let score = 0;
        if (it.brand) score += 4;
        if (typeof it.calories100 === "number") score += 1;
        if (typeof it.protein100 === "number") score += 1;
        if (typeof it.fat100 === "number") score += 1;
        if (typeof it.carbs100 === "number") score += 1;
        if (it.category) score += 1;
        return score;
      };

      // Group only the user's own (non-ministry) items by normalized name.
      const groups = new Map<string, Verified100Item[]>();
      for (const it of items) {
        if (!it.name || it.id.startsWith("moh:")) continue;
        const key = normalizeText(it.name);
        const arr = groups.get(key);
        if (arr) arr.push(it);
        else groups.set(key, [it]);
      }

      const idsToRemove: string[] = [];
      for (const arr of groups.values()) {
        if (arr.length < 2) continue;
        // Keep the most complete; on a tie keep the most recently updated.
        const sorted = [...arr].sort((a, b) => {
          const diff = completeness(b) - completeness(a);
          if (diff !== 0) return diff;
          return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
        });
        for (const dup of sorted.slice(1)) idsToRemove.push(dup.id);
      }

      if (idsToRemove.length === 0) {
        showToast("לא נמצאו כפילויות", "success");
        return { removed: 0 };
      }

      const basePath = `users/${user.uid}/verified100/items`;
      const baseRef = ref(db, basePath);
      const chunkSize = 200;
      for (let i = 0; i < idsToRemove.length; i += chunkSize) {
        const chunk = idsToRemove.slice(i, i + chunkSize);
        const updates: Record<string, null> = {};
        for (const id of chunk) updates[id] = null;
        await update(baseRef, updates);
      }

      showToast(`נוקו ${idsToRemove.length.toLocaleString("he-IL")} כפילויות`, "success");
      return { removed: idsToRemove.length };
    } catch (e) {
      const message =
        e instanceof Error && e.message ? e.message : "שגיאה לא ידועה";
      showToast(`ניקוי כפילויות נכשל: ${message}`, "error");
      return { removed: 0 };
    }
  }, [user, items, showToast]);

  const syncFromMinistry = useCallback(
    async (opts?: { signal?: AbortSignal }) => {
      if (!user) {
        showToast("צריך להתחבר כדי לסנכרן", "error");
        return { written: 0, enriched: 0 };
      }
      try {
        showToast("מסנכרן מאגר משרד הבריאות (מידות + מתכונים)…", "success");
        const ministryRows = await fetchMinistryVerifiedRows(opts?.signal);
        const now = new Date().toISOString();
        const basePath = `users/${user.uid}/verified100/items`;
        const baseRef = ref(db, basePath);
        const chunkSize = 200;
        let written = 0;
        let enriched = 0;

        const enrichUpdates: Record<string, unknown> = {};
        for (const existing of items) {
          if (existing.id.startsWith("moh:")) continue;
          let best: (typeof ministryRows)[number] | null = null;
          let bestScore = 0;
          for (const m of ministryRows) {
            if (m.ministryKind === "recipe") continue;
            const s = scoreVerifiedMatch(m, { name: existing.name, brand: existing.brand });
            if (s > bestScore) {
              bestScore = s;
              best = m;
            }
          }
          if (!best || bestScore < VERIFIED_AUTO_APPLY_MIN_SCORE || !verifiedHasPortions(best)) {
            continue;
          }
          const patch: Verified100Item = {
            ...existing,
            updatedAt: now,
            ministryCode: best.ministryCode,
            ...(best.ministryKind ? { ministryKind: best.ministryKind } : {}),
            ...(best.portionLines?.length ? { portionLines: best.portionLines } : {}),
            ...(best.unitWeightG ? { unitWeightG: best.unitWeightG } : {}),
            ...(best.servingWeightG ? { servingWeightG: best.servingWeightG } : {}),
            ...(best.packWeightG ? { packWeightG: best.packWeightG } : {}),
            ...(best.unitsPerPack ? { unitsPerPack: best.unitsPerPack } : {}),
            ...(best.measures ? { measures: best.measures } : {}),
          };
          enrichUpdates[existing.id] = cleanForRtdb(patch);
          enriched += 1;
        }

        if (Object.keys(enrichUpdates).length > 0) {
          const ids = Object.keys(enrichUpdates);
          for (let i = 0; i < ids.length; i += chunkSize) {
            const chunkIds = ids.slice(i, i + chunkSize);
            const updates: Record<string, unknown> = {};
            for (const id of chunkIds) updates[id] = enrichUpdates[id];
            await update(baseRef, updates);
          }
        }

        for (let i = 0; i < ministryRows.length; i += chunkSize) {
          const chunk = ministryRows.slice(i, i + chunkSize);
          const updates: Record<string, unknown> = {};
          for (const row of chunk) {
            const id = `moh:${row.ministryCode}`;
            const item: Verified100Item = {
              id,
              name: row.name,
              createdAt: now,
              updatedAt: now,
              ministryCode: row.ministryCode,
              ministryKind: row.ministryKind,
              ...(row.portionLines?.length ? { portionLines: row.portionLines } : {}),
              ...(row.unitWeightG ? { unitWeightG: row.unitWeightG } : {}),
              ...(row.servingWeightG ? { servingWeightG: row.servingWeightG } : {}),
              ...(row.packWeightG ? { packWeightG: row.packWeightG } : {}),
              ...(row.unitsPerPack ? { unitsPerPack: row.unitsPerPack } : {}),
              ...(row.measures ? { measures: row.measures } : {}),
              ...(row.ministryKind === "recipe" && row.protein100 != null
                ? { protein100: row.protein100 }
                : {}),
              ...(row.ministryKind === "recipe" && row.fat100 != null ? { fat100: row.fat100 } : {}),
              ...(row.ministryKind === "recipe" && row.carbs100 != null
                ? { carbs100: row.carbs100 }
                : {}),
              ...(row.ministryKind === "recipe" && row.calories100 != null
                ? { calories100: row.calories100 }
                : {}),
            };
            updates[id] = cleanForRtdb(item);
          }
          await update(baseRef, updates);
          written += chunk.length;
        }

        showToast(
          `סנכרון משרד הבריאות — ${written.toLocaleString("he-IL")} מצרכים (מידות בלבד), ${enriched.toLocaleString("he-IL")} פריטי TSV הועשרו במידות`,
          "success",
        );
        return { written, enriched };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          showToast("סנכרון משרד הבריאות הופסק", "error");
          return { written: 0, enriched: 0 };
        }
        const message = e instanceof Error && e.message ? e.message : "שגיאה בסנכרון";
        showToast(`סנכרון נכשל: ${message}`, "error");
        return { written: 0, enriched: 0 };
      }
    },
    [user, items, showToast],
  );

  const findBestMatch = useCallback(
    (q: { name: string; brand?: string }) => {
      if (!q.name.trim() || items.length === 0) return null;
      const scored: Match[] = [];
      for (const it of items) {
        const s = scoreVerifiedMatch(it, q);
        if (s >= 35) scored.push({ item: it, score: s });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored[0]?.item ?? null;
    },
    [items],
  );

  const findScoredMatches = useCallback(
    (
      q: { name: string; brand?: string },
      opts?: {
        limit?: number;
        source?: "all" | "tsv" | "ministry";
        excludeKinds?: MinistryFoodKind[];
        kindsOnly?: MinistryFoodKind[];
      },
    ) => {
      if (!q.name.trim() || items.length === 0) return [];
      const source = opts?.source ?? "all";
      const excludeKinds = new Set(opts?.excludeKinds ?? []);
      const kindsOnly = opts?.kindsOnly?.length ? new Set(opts.kindsOnly) : null;
      if (source === "ministry" && !kindsOnly && excludeKinds.size === 0) {
        excludeKinds.add("recipe");
      }
      const scored: Match[] = [];
      for (const it of items) {
        const isMoh = it.id.startsWith("moh:");
        if (source === "tsv" && isMoh) continue;
        if (source === "ministry" && !isMoh) continue;
        const kind = it.ministryKind;
        if (kindsOnly && (!kind || !kindsOnly.has(kind))) continue;
        if (kind && excludeKinds.has(kind)) continue;
        const s = scoreVerifiedMatch(it, q);
        if (s >= 35) scored.push({ item: it, score: s });
      }
      scored.sort((a, b) => {
        const adjA = a.score - ministryKindSortPenalty(a.item.ministryKind);
        const adjB = b.score - ministryKindSortPenalty(b.item.ministryKind);
        if (source === "all") {
          const aMoh = a.item.id.startsWith("moh:") ? 1 : 0;
          const bMoh = b.item.id.startsWith("moh:") ? 1 : 0;
          if (bMoh !== aMoh) return bMoh - aMoh;
        }
        if (adjB !== adjA) return adjB - adjA;
        return b.score - a.score;
      });
      const limit = Math.max(1, Math.min(30, opts?.limit ?? 12));
      return scored.slice(0, limit);
    },
    [items],
  );

  const findMatches = useCallback(
    (q: { name: string; brand?: string }, opts?: { limit?: number }) => {
      return findScoredMatches(q, opts).map((m) => m.item);
    },
    [findScoredMatches],
  );

  const value = useMemo<Verified100ContextValue>(
    () => ({
      items,
      loading,
      error: error ?? stuckHint,
      cloudSyncPaused,
      pauseCloudSync,
      resumeCloudSync,
      importTsv,
      removeDuplicates,
      syncFromMinistry,
      findBestMatch,
      findMatches,
      findScoredMatches,
    }),
    [
      items,
      loading,
      error,
      stuckHint,
      cloudSyncPaused,
      pauseCloudSync,
      resumeCloudSync,
      importTsv,
      removeDuplicates,
      syncFromMinistry,
      findBestMatch,
      findMatches,
      findScoredMatches,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVerified100() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVerified100 must be used within Verified100Provider");
  return ctx;
}

