import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBG1OAu4JYl1bEO3xN9xPBZiSlLuZMMv5k",
  authDomain: "caloric-database.firebaseapp.com",
  projectId: "caloric-database",
  storageBucket: "caloric-database.firebasestorage.app",
  messagingSenderId: "389379047394",
  appId: "1:389379047394:web:1124642525b82ff32003bb",
  databaseURL:
    "https://caloric-database-default-rtdb.europe-west1.firebasedatabase.app",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
