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
  importTsv: (file: File) => Promise<void>;
  findBestMatch: (q: { name: string; brand?: string }) => Verified100Item | null;
};

const Ctx = createContext<Verified100ContextValue | null>(null);

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

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    const r = ref(db, `users/${user.uid}/verified100/items`);
    const unsub = onValue(
      r,
      (snap: DataSnapshot) => {
        const v = snap.val() as Record<string, Verified100Item> | null;
        const list = v ? Object.values(v) : [];
        setItems(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user]);

  const importTsv = useCallback(
    async (file: File) => {
      if (!user) {
        showToast("צריך להתחבר כדי לייבא", "error");
        return;
      }
      const text = await file.text();
      const rows = parseVerifiedTsv(text);
      if (rows.length === 0) {
        showToast("לא זוהו נתונים בקובץ", "error");
        return;
      }

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {};

      for (const row of rows) {
        const id = stableId(row.brand, row.name);
        updates[`users/${user.uid}/verified100/items/${id}`] = {
          ...row,
          id,
          createdAt: now,
          updatedAt: now,
        } satisfies Verified100Item;
      }

      // Single update writes the whole import efficiently.
      await update(ref(db), updates);
      showToast(`יובאו ${rows.length.toLocaleString("he-IL")} מוצרים מאומתים`, "success");
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
    () => ({ items, loading, error, importTsv, findBestMatch }),
    [items, loading, error, importTsv, findBestMatch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVerified100() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVerified100 must be used within Verified100Provider");
  return ctx;
}

