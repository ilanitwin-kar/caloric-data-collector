import { useEffect, useState } from "react";
import { BODY_WEIGHT_CHANGED, readBodyWeightKg } from "../utils/bodyWeightStorage";

export function useBodyWeightKg(): number | null {
  const [kg, setKg] = useState(readBodyWeightKg);
  useEffect(() => {
    const sync = () => setKg(readBodyWeightKg());
    window.addEventListener(BODY_WEIGHT_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BODY_WEIGHT_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return kg;
}
