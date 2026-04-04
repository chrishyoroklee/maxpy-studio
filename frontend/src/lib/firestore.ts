import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
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

export async function savePrompt(data: {
  prompt: string;
  model: string;
  templateUsed?: string;
}): Promise<string> {
  if (!auth.currentUser) return "";

  const docRef = await addDoc(collection(db, "prompts"), {
    ...data,
    uid: auth.currentUser.uid,
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
  if (!auth.currentUser) return "";

  const docRef = await addDoc(collection(db, "generations"), {
    ...data,
    uid: auth.currentUser.uid,
    amxdStoragePath: null,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateGenerationStoragePath(
  generationId: string,
  storagePath: string,
): Promise<void> {
  const docRef = doc(db, "generations", generationId);
  await updateDoc(docRef, { amxdStoragePath: storagePath });
}
