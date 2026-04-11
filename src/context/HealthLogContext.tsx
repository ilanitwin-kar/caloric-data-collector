import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onValue, ref, set } from "firebase/database";
import { db } from "../lib/firebase";
import type { ActivityEntry, MealEntry, WeightEntry } from "../types/health";

type HealthLogContextValue = {
  meals: MealEntry[];
  weightEntries: WeightEntry[];
  activities: ActivityEntry[];
  loading: boolean;
  error: string | null;
  addMeal: (name: string, calories: number) => void;
  addWeight: (kg: number) => void;
  addActivity: (name: string, minutes: number, caloriesBurned?: number) => void;
};

const HealthLogContext = createContext<HealthLogContextValue | null>(null);

function sortByCreatedDesc<T extends { createdAt: string }>(arr: T[]): T[] {
  return [...arr].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function HealthLogProvider({ children }: { children: ReactNode }) {
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const firstSnap = useRef({ meals: false, weight: false, activities: false });

  useEffect(() => {
    firstSnap.current = { meals: false, weight: false, activities: false };
    setLoading(true);

    const tryInitialLoadDone = () => {
      const f = firstSnap.current;
      if (f.meals && f.weight && f.activities) setLoading(false);
    };

    const rMeals = ref(db, "meals");
    const rWeight = ref(db, "weightEntries");
    const rAct = ref(db, "activities");

    const u1 = onValue(
      rMeals,
      (snap) => {
        setError(null);
        const v = snap.val() as Record<string, MealEntry> | null;
        setMeals(sortByCreatedDesc(v ? Object.values(v) : []));
        if (!firstSnap.current.meals) {
          firstSnap.current.meals = true;
          tryInitialLoadDone();
        }
      },
      (err) => {
        setError(err.message);
        if (!firstSnap.current.meals) {
          firstSnap.current.meals = true;
          tryInitialLoadDone();
        }
      },
    );
    const u2 = onValue(
      rWeight,
      (snap) => {
        setError(null);
        const v = snap.val() as Record<string, WeightEntry> | null;
        setWeightEntries(sortByCreatedDesc(v ? Object.values(v) : []));
        if (!firstSnap.current.weight) {
          firstSnap.current.weight = true;
          tryInitialLoadDone();
        }
      },
      (err) => {
        setError(err.message);
        if (!firstSnap.current.weight) {
          firstSnap.current.weight = true;
          tryInitialLoadDone();
        }
      },
    );
    const u3 = onValue(
      rAct,
      (snap) => {
        setError(null);
        const v = snap.val() as Record<string, ActivityEntry> | null;
        setActivities(sortByCreatedDesc(v ? Object.values(v) : []));
        if (!firstSnap.current.activities) {
          firstSnap.current.activities = true;
          tryInitialLoadDone();
        }
      },
      (err) => {
        setError(err.message);
        if (!firstSnap.current.activities) {
          firstSnap.current.activities = true;
          tryInitialLoadDone();
        }
      },
    );

    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const addMeal = useCallback((name: string, calories: number) => {
    const id = crypto.randomUUID();
    const entry: MealEntry = {
      id,
      name: name.trim(),
      calories,
      createdAt: new Date().toISOString(),
    };
    void set(ref(db, `meals/${id}`), entry);
  }, []);

  const addWeight = useCallback((kg: number) => {
    const id = crypto.randomUUID();
    const entry: WeightEntry = {
      id,
      kg,
      createdAt: new Date().toISOString(),
    };
    void set(ref(db, `weightEntries/${id}`), entry);
  }, []);

  const addActivity = useCallback(
    (name: string, minutes: number, caloriesBurned?: number) => {
      const id = crypto.randomUUID();
      const entry: ActivityEntry = {
        id,
        name: name.trim(),
        minutes,
        createdAt: new Date().toISOString(),
      };
      if (caloriesBurned !== undefined && Number.isFinite(caloriesBurned)) {
        entry.caloriesBurned = caloriesBurned;
      }
      void set(ref(db, `activities/${id}`), entry);
    },
    [],
  );

  const value = useMemo(
    () => ({
      meals,
      weightEntries,
      activities,
      loading,
      error,
      addMeal,
      addWeight,
      addActivity,
    }),
    [
      meals,
      weightEntries,
      activities,
      loading,
      error,
      addMeal,
      addWeight,
      addActivity,
    ],
  );

  return (
    <HealthLogContext.Provider value={value}>
      {children}
    </HealthLogContext.Provider>
  );
}

export function useHealthLog() {
  const ctx = useContext(HealthLogContext);
  if (!ctx) throw new Error("useHealthLog must be used within HealthLogProvider");
  return ctx;
}
