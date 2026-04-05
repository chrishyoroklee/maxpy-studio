import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { auth } from "./firebase";

// ---- Helpers ----

function getSessionId(): string {
  let id = sessionStorage.getItem("maxpy-session-id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("maxpy-session-id", id);
  }
  return id;
}

function uid(): string | null {
  return auth.currentUser?.uid ?? null;
}

/** Strip undefined values — Firestore rejects them. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
}

// ---- User doc ----

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

// ---- Plugins ----

export interface PluginDoc {
  id: string;
  name: string;
  deviceType: string | null;
  templateUsed: string | null;
  status: "draft" | "ready";
  amxdStoragePath: string | null;
  model: string;
  createdAt: any;
  updatedAt: any;
}

export async function createPlugin(name: string, model: string, templateUsed?: string): Promise<string> {
  const u = uid();
  if (!u) return "";

  const docRef = await addDoc(collection(db, "users", u, "plugins"), {
    name,
    deviceType: null,
    templateUsed: templateUsed || null,
    status: "draft",
    amxdStoragePath: null,
    model,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Increment plugin counter
  await updateDoc(doc(db, "users", u), {
    totalPlugins: increment(1),
  }).catch(() => {});

  return docRef.id;
}

export async function loadPlugin(pluginId: string): Promise<PluginDoc | null> {
  const u = uid();
  if (!u) return null;
  const snap = await getDoc(doc(db, "users", u, "plugins", pluginId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as PluginDoc;
}

export async function loadPlugins(): Promise<PluginDoc[]> {
  const u = uid();
  if (!u) return [];

  const q = query(
    collection(db, "users", u, "plugins"),
    orderBy("updatedAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PluginDoc));
}

export async function updatePlugin(
  pluginId: string,
  data: Partial<Pick<PluginDoc, "name" | "deviceType" | "status" | "amxdStoragePath" | "model" | "templateUsed">>,
): Promise<void> {
  const u = uid();
  if (!u) return;

  await updateDoc(doc(db, "users", u, "plugins", pluginId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePlugin(pluginId: string): Promise<void> {
  const u = uid();
  if (!u) return;

  // Delete messages subcollection first
  const messagesSnap = await getDocs(
    collection(db, "users", u, "plugins", pluginId, "messages")
  );
  for (const msgDoc of messagesSnap.docs) {
    await deleteDoc(msgDoc.ref);
  }

  await deleteDoc(doc(db, "users", u, "plugins", pluginId));
}

// ---- Plugin Messages ----

export interface MessageDoc {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  error?: string;
  warnings?: Array<{ severity: string; code: string; message: string }>;
  amxdStoragePath?: string;
  createdAt: any;
}

export async function saveMessage(
  pluginId: string,
  data: Omit<MessageDoc, "id" | "createdAt">,
): Promise<string> {
  const u = uid();
  if (!u) return "";

  const docRef = await addDoc(
    collection(db, "users", u, "plugins", pluginId, "messages"),
    { ...stripUndefined(data as Record<string, unknown>), createdAt: serverTimestamp() }
  );

  // Touch plugin updatedAt
  await updateDoc(doc(db, "users", u, "plugins", pluginId), {
    updatedAt: serverTimestamp(),
  }).catch(() => {});

  return docRef.id;
}

export async function loadMessages(pluginId: string): Promise<MessageDoc[]> {
  const u = uid();
  if (!u) return [];

  const q = query(
    collection(db, "users", u, "plugins", pluginId, "messages"),
    orderBy("createdAt", "asc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MessageDoc));
}

// ---- Legacy: Prompts & Generations (kept for backward compat) ----

export async function savePrompt(data: {
  prompt: string;
  model: string;
  templateUsed?: string;
  pluginId?: string;
}): Promise<string> {
  const u = uid();
  if (!u) return "";

  const docRef = await addDoc(collection(db, "users", u, "prompts"), {
    ...stripUndefined(data as Record<string, unknown>),
    sessionId: getSessionId(),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function saveGeneration(data: {
  promptId: string;
  pluginId?: string;
  llmResponse: string;
  extractedCode: string;
  status: "success" | "error";
  errorMessage?: string;
  validationIssues?: Array<{ severity: string; code: string; message: string }>;
}): Promise<string> {
  const u = uid();
  if (!u) return "";

  const docRef = await addDoc(collection(db, "users", u, "generations"), {
    ...stripUndefined(data as Record<string, unknown>),
    amxdStoragePath: null,
    createdAt: serverTimestamp(),
  });

  const userRef = doc(db, "users", u);
  await updateDoc(userRef, {
    totalGenerations: increment(1),
    ...(data.status === "success" ? { successfulGenerations: increment(1) } : {}),
  }).catch(() => {});

  return docRef.id;
}

export async function logEvent(
  event: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const u = uid();
  if (!u) return;

  await addDoc(collection(db, "users", u, "events"), {
    event,
    ...metadata,
    sessionId: getSessionId(),
    createdAt: serverTimestamp(),
  }).catch(() => {});
}

export async function updateGenerationStoragePath(
  userId: string,
  generationId: string,
  storagePath: string,
): Promise<void> {
  const docRef = doc(db, "users", userId, "generations", generationId);
  await updateDoc(docRef, { amxdStoragePath: storagePath });
}
