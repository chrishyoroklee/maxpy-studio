import { collection, addDoc, serverTimestamp } from "firebase/firestore";
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
  const docRef = await addDoc(collection(db, "prompts"), {
    ...data,
    uid: auth.currentUser?.uid ?? null,
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
  const docRef = await addDoc(collection(db, "generations"), {
    ...data,
    uid: auth.currentUser?.uid ?? null,
    amxdStoragePath: null,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
