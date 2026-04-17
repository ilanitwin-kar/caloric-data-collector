export const WALKING_MET = 3.5;
export const STEPS_PER_MINUTE = 100;

function kcalPerMinute(bodyWeightKg: number, met: number): number {
  return (met * 3.5 * bodyWeightKg) / 200;
}

export function walkingStepsToBurnKcal(
  kcal: number,
  bodyWeightKg: number,
  met: number = WALKING_MET,
  stepsPerMinute: number = STEPS_PER_MINUTE,
): number | null {
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) return null;
  const perMin = kcalPerMinute(bodyWeightKg, met);
  if (!(perMin > 0)) return null;
  const minutes = kcal / perMin;
  return Math.max(0, Math.round(minutes * stepsPerMinute));
}
