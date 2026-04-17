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
  stableId,
  type Verified100Row,
} from "../utils/verifiedTsv";

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
  findBestMatch: (q: { name: string; brand?: string }) => Verified100Item | null;
};

const Ctx = createContext<Verified100ContextValue | null>(null);

function cleanForRtdb<T>(value: T): T {
  // RTDB rejects `undefined` anywhere in the payload.
  // JSON stringify drops undefined object keys (and would turn undefined array items into null,
  // but we don't use arrays in the payload). Keeps payload deterministic and safe for update().
  return JSON.parse(JSON.stringify(value)) as T;
}

async function readFileTextWithFallback(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
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

function scoreMatch(item: Verified100Item, q: { name: string; brand?: string }): number {
  const nameQ = normalizeText(q.name);
  const brandQ = normalizeText(q.brand ?? "");
  const nameI = normalizeText(item.name);
  const brandI = normalizeText(item.brand ?? "");

  if (!nameQ) return 0;
  let score = 0;

  // Name token overlap
  const tokens = nameQ.split(" ").filter(Boolean);
  let hit = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (nameI.includes(t)) hit += 1;
  }
  score += Math.min(6, hit) * 10;

  // Full substring bonus
  if (nameI.includes(nameQ) || nameQ.includes(nameI)) score += 25;

  // Brand bonus
  if (brandQ && brandI) {
    if (brandI === brandQ) score += 18;
    else if (brandI.includes(brandQ) || brandQ.includes(brandI)) score += 10;
  }

  return score;
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
    const r = ref(db, `users/${user.uid}/verified100/items`);
    let gotData = false;
    const stuckTimer = window.setTimeout(() => {
      if (!gotData) {
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
        setItems(list);
        setError(null);
        setLoading(false);
        setStuckHint(null);
      },
      (err) => {
        gotData = true;
        window.clearTimeout(stuckTimer);
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

  const findBestMatch = useCallback(
    (q: { name: string; brand?: string }) => {
      if (!q.name.trim() || items.length === 0) return null;
      const scored: Match[] = [];
      for (const it of items) {
        const s = scoreMatch(it, q);
        if (s >= 35) scored.push({ item: it, score: s });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored[0]?.item ?? null;
    },
    [items],
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
      findBestMatch,
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
      findBestMatch,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVerified100() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVerified100 must be used within Verified100Provider");
  return ctx;
}

