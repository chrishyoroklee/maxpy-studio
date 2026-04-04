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
 * Exported so it can be called on auth state change.
 */
export async function ensureUserDoc(): Promise<void> {
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
  validationIssues?: Array<{ severity: string; code: string; message: string }>;
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

/**
 * Log a user event (template click, download, etc.) to users/{uid}/events.
 */
export async function logEvent(
  event: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  await addDoc(collection(db, "users", user.uid, "events"), {
    event,
    ...metadata,
    sessionId: getSessionId(),
    createdAt: serverTimestamp(),
  }).catch(() => {});
}

export async function updateGenerationStoragePath(
  uid: string,
  generationId: string,
  storagePath: string,
): Promise<void> {
  const docRef = doc(db, "users", uid, "generations", generationId);
  await updateDoc(docRef, { amxdStoragePath: storagePath });
}
