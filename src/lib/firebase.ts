import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

function requireEnv(name: string): string {
  const value = import.meta.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value);
}

export const DATABASE_URL = requireEnv("VITE_FIREBASE_DATABASE_URL");

const firebaseConfig = {
  apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
  authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requireEnv("VITE_FIREBASE_APP_ID"),
  databaseURL: DATABASE_URL,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app, DATABASE_URL);
