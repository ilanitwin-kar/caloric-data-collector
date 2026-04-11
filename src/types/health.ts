export interface MealEntry {
  id: string;
  name: string;
  calories: number;
  createdAt: string;
}

export interface WeightEntry {
  id: string;
  kg: number;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  name: string;
  minutes: number;
  caloriesBurned?: number;
  createdAt: string;
}
