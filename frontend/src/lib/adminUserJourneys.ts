import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import { isAdmin } from "./admins";

export interface UserEvent {
  event: string;
  createdAt: string;
  sessionId?: string;
  // prompt_submitted
  promptLength?: number;
  wordCount?: number;
  hasTemplateContext?: boolean;
  templateUsed?: string;
  isFollowUp?: boolean;
  deviceType?: string;
  // view_close
  view?: string;
  durationMs?: number;
  wasGlance?: boolean;
  // generation
  errorType?: string;
  success?: boolean;
  // suggestion
  suggestion?: string;
  section?: string;
  direction?: number;
  // misc
  variant?: string;
  tab?: string;
  pluginName?: string;
  template?: string;
  [key: string]: unknown;
}

export interface UserPrompt {
  prompt: string;
  createdAt: string;
  templateUsed?: string;
}

export interface UserJourney {
  uid: string;
  email: string;
  displayName: string;
  events: UserEvent[];
  prompts: UserPrompt[];
  pluginCount: number;
  successfulGenerations: number;
  totalGenerations: number;
}

export async function fetchUserJourneys(): Promise<UserJourney[]> {
  const usersSnap = await getDocs(collection(db, "users"));
  const journeys: UserJourney[] = [];

  const fetches = usersSnap.docs
    .filter((doc) => !isAdmin(doc.id))
    .map(async (userDoc) => {
      const data = userDoc.data();
      const uid = userDoc.id;

      const [eventsSnap, promptsSnap, pluginsSnap] = await Promise.all([
        getDocs(query(collection(db, `users/${uid}/events`), orderBy("createdAt", "asc"))),
        getDocs(query(collection(db, `users/${uid}/prompts`), orderBy("createdAt", "asc"))),
        getDocs(collection(db, `users/${uid}/plugins`)),
      ]);

      const events = eventsSnap.docs.map((d) => {
        const e = d.data();
        return {
          ...e,
          createdAt: e.createdAt?.toDate?.()
            ? e.createdAt.toDate().toISOString()
            : e.createdAt,
        } as UserEvent;
      });

      const prompts = promptsSnap.docs.map((d) => {
        const p = d.data();
        return {
          prompt: (p.prompt as string)?.slice(0, 100) || "",
          createdAt: p.createdAt?.toDate?.()
            ? p.createdAt.toDate().toISOString()
            : p.createdAt,
          templateUsed: p.templateUsed as string | undefined,
        };
      });

      if (events.length < 10) return null;

      return {
        uid,
        email: (data.email as string) || "anonymous",
        displayName: (data.displayName as string) || "",
        events,
        prompts,
        pluginCount: pluginsSnap.size,
        successfulGenerations: (data.successfulGenerations as number) || 0,
        totalGenerations: (data.totalGenerations as number) || 0,
      };
    });

  const results = await Promise.all(fetches);
  for (const r of results) {
    if (r) journeys.push(r);
  }

  journeys.sort(
    (a, b) =>
      b.events.length + b.prompts.length - (a.events.length + a.prompts.length),
  );

  return journeys;
}
