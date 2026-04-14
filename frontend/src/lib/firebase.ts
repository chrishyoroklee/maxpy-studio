import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

/** Non-empty string from Vite env, or dev-only placeholder so `initializeApp` never throws when `.env` is missing. */
function envString(value: string | undefined, devFallback: string): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (import.meta.env.DEV) return devFallback;
  return "";
}

const firebaseConfig = {
  apiKey: envString(import.meta.env.VITE_FIREBASE_API_KEY, "dev-local-placeholder-api-key"),
  authDomain: envString(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, "maxpylang-studio.firebaseapp.com"),
  projectId: envString(import.meta.env.VITE_FIREBASE_PROJECT_ID, "maxpylang-studio"),
  storageBucket: envString(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, "maxpylang-studio.appspot.com"),
  messagingSenderId: envString(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, "000000000000"),
  appId: envString(import.meta.env.VITE_FIREBASE_APP_ID, "1:000000000000:web:localdevplaceholder"),
};

if (!firebaseConfig.apiKey) {
  throw new Error(
    "Missing VITE_FIREBASE_API_KEY. Copy frontend/.env.example to frontend/.env and add your Firebase web app config."
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Connect to emulators in local development (run `firebase emulators:start` from repo root)
if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, "127.0.0.1", 8181);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
