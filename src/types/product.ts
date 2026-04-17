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
  totalWeight: number;
  units: number;
  unitWeight: number;
  calsUnit: number;
  protUnit: number;
  carbUnit: number;
  fatUnit: number;
  savedAt: string;
}
