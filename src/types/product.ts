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
  totalWeight: number;
  units: number;
  unitWeight: number;
  calsUnit: number;
  protUnit: number;
  carbUnit: number;
  fatUnit: number;
  savedAt: string;
}
