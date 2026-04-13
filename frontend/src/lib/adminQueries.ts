import {
  collectionGroup,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

// ---- Types ----

export interface AdminStats {
  // Overview
  totalUsers: number;
  totalSessions: number;
  totalPluginsCreated: number;
  totalGenerations: number;

  // Generation performance
  successCount: number;
  failureCount: number;
  successRate: number;
  avgAttemptsToSuccess: number;
  selfCorrectionRate: number;
  retryAttempts: number;
  retryByType: { extraction: number; execution: number };

  // Prompt analysis
  avgPromptLength: number;
  avgWordCount: number;
  templateRate: number;
  followUpRate: number;
  promptCount: number;

  // Engagement
  graphViewCount: number;
  codeViewCount: number;
  avgViewDurationMs: number;
  glanceRate: number;
  fullscreenCount: number;
  graphInteractCount: number;

  // Satisfaction
  thumbsUp: number;
  thumbsDown: number;
  satisfactionRate: number;

  // Downloads & validation
  totalDownloads: number;
  downloadsWithWarnings: number;
  validationExpandCount: number;
}

// ---- Helpers ----

async function countEvents(eventName: string): Promise<number> {
  const q = query(collectionGroup(db, "events"), where("event", "==", eventName));
  const snap = await getDocs(q);
  return snap.size;
}

async function getEventDocs(eventName: string) {
  const q = query(collectionGroup(db, "events"), where("event", "==", eventName));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

// ---- Main fetch ----

export async function fetchAdminStats(): Promise<AdminStats> {
  // Run all queries in parallel
  const [
    users,
    sessionStartDocs,
    pluginCreateDocs,
    successDocs,
    failureDocs,
    retryDocs,
    promptDocs,
    viewOpenDocs,
    viewCloseDocs,
    fullscreenCount,
    interactDocs,
    ratingDocs,
    downloadDocs,
    validationExpandCount,
  ] = await Promise.all([
    getDocs(collection(db, "users")),
    getEventDocs("session_start"),
    getEventDocs("plugin_create"),
    getEventDocs("generation_success"),
    getEventDocs("generation_failure"),
    getEventDocs("retry_attempt"),
    getEventDocs("prompt_submitted"),
    getEventDocs("view_open"),
    getEventDocs("view_close"),
    countEvents("graph_fullscreen_open"),
    getEventDocs("graph_interact"),
    getEventDocs("plugin_rating"),
    getEventDocs("download"),
    countEvents("validation_expand"),
  ]);

  // Overview
  const totalUsers = users.size;
  const totalSessions = sessionStartDocs.length;
  const totalPluginsCreated = pluginCreateDocs.length;
  const successCount = successDocs.length;
  const failureCount = failureDocs.length;
  const totalGenerations = successCount + failureCount;

  // Generation performance
  const successRate = totalGenerations > 0 ? successCount / totalGenerations : 0;

  let totalAttempts = 0;
  let selfCorrectionCount = 0;
  for (const doc of successDocs) {
    totalAttempts += (doc.successAttempt as number) || 1;
    if (doc.hadRetries) selfCorrectionCount++;
  }
  const avgAttemptsToSuccess = successCount > 0 ? totalAttempts / successCount : 0;
  const selfCorrectionRate = successCount > 0 ? selfCorrectionCount / successCount : 0;

  let extractionRetries = 0;
  let executionRetries = 0;
  for (const doc of retryDocs) {
    if (doc.errorType === "extraction") extractionRetries++;
    else executionRetries++;
  }

  // Prompt analysis
  let totalPromptLength = 0;
  let totalWordCount = 0;
  let templateCount = 0;
  let followUpCount = 0;
  for (const doc of promptDocs) {
    totalPromptLength += (doc.promptLength as number) || 0;
    totalWordCount += (doc.wordCount as number) || 0;
    if (doc.hasTemplateContext) templateCount++;
    if (doc.isFollowUp) followUpCount++;
  }
  const promptCount = promptDocs.length;
  const avgPromptLength = promptCount > 0 ? totalPromptLength / promptCount : 0;
  const avgWordCount = promptCount > 0 ? totalWordCount / promptCount : 0;
  const templateRate = promptCount > 0 ? templateCount / promptCount : 0;
  const followUpRate = promptCount > 0 ? followUpCount / promptCount : 0;

  // Engagement
  let graphViewCount = 0;
  let codeViewCount = 0;
  for (const doc of viewOpenDocs) {
    if (doc.view === "patch") graphViewCount++;
    else if (doc.view === "code") codeViewCount++;
  }

  let totalDuration = 0;
  let glanceCount = 0;
  for (const doc of viewCloseDocs) {
    totalDuration += (doc.durationMs as number) || 0;
    if (doc.wasGlance) glanceCount++;
  }
  const avgViewDurationMs = viewCloseDocs.length > 0 ? totalDuration / viewCloseDocs.length : 0;
  const glanceRate = viewCloseDocs.length > 0 ? glanceCount / viewCloseDocs.length : 0;
  const graphInteractCount = interactDocs.length;

  // Satisfaction
  let thumbsUp = 0;
  let thumbsDown = 0;
  for (const doc of ratingDocs) {
    if (doc.rating === "up") thumbsUp++;
    else thumbsDown++;
  }
  const totalRatings = thumbsUp + thumbsDown;
  const satisfactionRate = totalRatings > 0 ? thumbsUp / totalRatings : 0;

  // Downloads & validation
  const totalDownloads = downloadDocs.length;
  let downloadsWithWarnings = 0;
  for (const doc of downloadDocs) {
    if (doc.hasWarnings) downloadsWithWarnings++;
  }

  return {
    totalUsers,
    totalSessions,
    totalPluginsCreated,
    totalGenerations,
    successCount,
    failureCount,
    successRate,
    avgAttemptsToSuccess,
    selfCorrectionRate,
    retryAttempts: retryDocs.length,
    retryByType: { extraction: extractionRetries, execution: executionRetries },
    avgPromptLength,
    avgWordCount,
    templateRate,
    followUpRate,
    promptCount,
    graphViewCount,
    codeViewCount,
    avgViewDurationMs,
    glanceRate,
    fullscreenCount,
    graphInteractCount,
    thumbsUp,
    thumbsDown,
    satisfactionRate,
    totalDownloads,
    downloadsWithWarnings,
    validationExpandCount,
  };
}
