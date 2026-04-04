import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { auth } from "./firebase";

function getSessionId(): string {
  let id = sessionStorage.getItem("maxpy-session-id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("maxpy-session-id", id);
  }
  return id;
}

/**
 * Create or update the user profile document.
 * Uses merge so existing fields (like counters) aren't overwritten.
 */
async function ensureUserDoc(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  await setDoc(
    userRef,
    {
      displayName: user.displayName || null,
      email: user.email || null,
      lastActiveAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function savePrompt(data: {
  prompt: string;
  model: string;
  templateUsed?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) return "";

  await ensureUserDoc();

  const docRef = await addDoc(collection(db, "users", user.uid, "prompts"), {
    ...data,
    sessionId: getSessionId(),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function saveGeneration(data: {
  promptId: string;
  llmResponse: string;
  extractedCode: string;
  status: "success" | "error";
  errorMessage?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) return "";

  const docRef = await addDoc(collection(db, "users", user.uid, "generations"), {
    ...data,
    amxdStoragePath: null,
    createdAt: serverTimestamp(),
  });

  // Increment counters on user doc
  const userRef = doc(db, "users", user.uid);
  await updateDoc(userRef, {
    totalGenerations: increment(1),
    ...(data.status === "success" ? { successfulGenerations: increment(1) } : {}),
  }).catch(() => {});

  return docRef.id;
}

export async function updateGenerationStoragePath(
  uid: string,
  generationId: string,
  storagePath: string,
): Promise<void> {
  const docRef = doc(db, "users", uid, "generations", generationId);
  await updateDoc(docRef, { amxdStoragePath: storagePath });
}
