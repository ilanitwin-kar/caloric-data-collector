import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

export const DATABASE_URL = "https://caloric-database-default-rtdb.europe-west1.firebasedatabase.app";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: DATABASE_URL,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app, DATABASE_URL);
