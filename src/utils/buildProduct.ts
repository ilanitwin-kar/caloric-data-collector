import type { Product } from "../types/product";

/** Builds a full `Product` from base nutrition + package fields (same logic as Home save). */
export function buildProductPayload(
  base: {
    barcode?: string;
    name: string;
    brand: string;
    cals100: number;
    prot100: number;
    carb100: number;
    fat100: number;
    sugars100?: number;
    satFat100?: number;
    transFat100?: number;
    fiber100?: number;
    sodiumMg100?: number;
    sugarTeaspoons100?: number;
    unitsPer100g?: number;
    tbspPer100g?: number;
    cupsPer100g?: number;
    totalWeight: number;
    units: number;
  },
  id: string,
  savedAt: string,
): Product {
  const tw = base.totalWeight;
  const u = base.units;
  const unitWeight = tw / u;
  const factor = unitWeight / 100;
  const c100 = base.cals100;
  const p100 = base.prot100;
  const cb100 = base.carb100;
  const f100 = base.fat100;
  return {
    id,
    savedAt,
    barcode: base.barcode?.trim() || undefined,
    name: base.name.trim(),
    brand: base.brand.trim(),
    cals100: c100,
    prot100: p100,
    carb100: cb100,
    fat100: f100,
    sugars100: base.sugars100,
    satFat100: base.satFat100,
    transFat100: base.transFat100,
    fiber100: base.fiber100,
    sodiumMg100: base.sodiumMg100,
    sugarTeaspoons100: base.sugarTeaspoons100,
    unitsPer100g: base.unitsPer100g,
    tbspPer100g: base.tbspPer100g,
    cupsPer100g: base.cupsPer100g,
    totalWeight: tw,
    units: u,
    unitWeight,
    calsUnit: c100 * factor,
    protUnit: p100 * factor,
    carbUnit: cb100 * factor,
    fatUnit: f100 * factor,
  };
}
