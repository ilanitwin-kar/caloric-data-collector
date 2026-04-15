import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const databaseURL = "https://caloric-database-default-rtdb.firebaseio.com";

const firebaseConfig = {
  apiKey: "AIzaSyBG1OAu4JYl1bEO3xN9xPBZiSlLuZMMv5k",
  authDomain: "caloric-database.firebaseapp.com",
  projectId: "caloric-database",
  storageBucket: "caloric-database.firebasestorage.app",
  messagingSenderId: "389379047394",
  appId: "1:389379047394:web:1124642525b82ff32003bb",
  databaseURL,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app, databaseURL);
export const storage = getStorage(app);
