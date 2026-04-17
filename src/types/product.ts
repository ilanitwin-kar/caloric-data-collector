export interface Product {
  id: string;
  /** Barcode (GTIN/EAN) if available. */
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
  /** Approximate teaspoons of sugars per 100g (label-style), when captured. */
  sugarTeaspoons100?: number;
  /**
   * Optional conversions defined by the user.
   * Examples:
   * - grapes: unitsPer100g = 20 (so 1 grape ≈ 5g)
   * - rice: tbspPer100g = 6.5 (so 1 tbsp ≈ 15.4g)
   */
  unitsPer100g?: number;
  tbspPer100g?: number;
  cupsPer100g?: number;
  totalWeight: number;
  units: number;
  unitWeight: number;
  calsUnit: number;
  protUnit: number;
  carbUnit: number;
  fatUnit: number;
  savedAt: string;
}
