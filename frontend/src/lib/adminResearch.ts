import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { isAdmin } from "./admins";

interface UserViewStats {
  uid: string;
  email: string;
  promptCount: number;
  followUpCount: number;
  followUpRate: number;
  graphOpens: number;
  codeOpens: number;
  viewedGraph: boolean;
  viewedCode: boolean;
  avgGraphDurationMs: number;
  avgCodeDurationMs: number;
  graphGlanceRate: number;
  codeGlanceRate: number;
  totalGenerations: number;
  successCount: number;
  successRate: number;
  avgAttemptsToSuccess: number;
}

export interface TemporalStats {
  graphAfterSuccess: number;
  graphAfterFailure: number;
  graphNoContext: number;
  graphAfterSuccessPct: number;
  graphAfterFailurePct: number;
  codeAfterSuccess: number;
  codeAfterFailure: number;
  codeNoContext: number;
  codeAfterSuccessPct: number;
  codeAfterFailurePct: number;
}

export interface ResearchStats {
  totalUsersWithPrompts: number;

  // RQ1: View engagement
  graphViewerCount: number;
  graphViewerPct: number;
  codeViewerCount: number;
  codeViewerPct: number;
  bothViewerCount: number;
  bothViewerPct: number;
  neitherViewerCount: number;
  neitherViewerPct: number;
  avgGraphDurationMs: number;
  avgCodeDurationMs: number;
  graphGlanceRate: number;
  codeGlanceRate: number;
  totalGraphOpens: number;
  totalCodeOpens: number;

  // RQ2: Correlation — view engagement × iteration
  followUpRate_graphViewers: number;
  followUpRate_nonGraphViewers: number;
  followUpRate_codeViewers: number;
  followUpRate_nonCodeViewers: number;

  // Correlation — view engagement × success
  successRate_graphViewers: number;
  successRate_nonGraphViewers: number;
  successRate_codeViewers: number;
  successRate_nonCodeViewers: number;

  // Correlation — view engagement × retry effort
  avgAttempts_graphViewers: number;
  avgAttempts_nonGraphViewers: number;
  avgAttempts_codeViewers: number;
  avgAttempts_nonCodeViewers: number;

  // Temporal analysis
  temporal: TemporalStats;

  // Per-user table
  users: UserViewStats[];
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

export async function fetchResearchStats(): Promise<ResearchStats> {
  const [usersSnap, viewOpenSnap, viewCloseSnap, promptSnap, genSuccessSnap, genFailSnap] =
    await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "view_open"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "view_close"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "prompt_submitted"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "generation_success"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "generation_failure"))),
    ]);

  // Group events by user
  type EventData = Record<string, unknown>;
  const byUser: Record<string, {
    email: string;
    viewOpens: EventData[];
    viewCloses: EventData[];
    prompts: EventData[];
    genSuccess: EventData[];
    genFail: EventData[];
  }> = {};

  const emailMap: Record<string, string> = {};
  for (const doc of usersSnap.docs) {
    if (isAdmin(doc.id)) continue;
    emailMap[doc.id] = (doc.data().email as string) || "anonymous";
  }

  function getUid(doc: QueryDocumentSnapshot): string | null {
    const uid = doc.ref.parent.parent?.id;
    if (!uid || isAdmin(uid)) return null;
    return uid;
  }

  function ensure(uid: string) {
    if (!byUser[uid]) {
      byUser[uid] = {
        email: emailMap[uid] || "anonymous",
        viewOpens: [], viewCloses: [], prompts: [], genSuccess: [], genFail: [],
      };
    }
    return byUser[uid];
  }

  for (const doc of viewOpenSnap.docs) {
    const uid = getUid(doc);
    if (uid) ensure(uid).viewOpens.push(doc.data());
  }
  for (const doc of viewCloseSnap.docs) {
    const uid = getUid(doc);
    if (uid) ensure(uid).viewCloses.push(doc.data());
  }
  for (const doc of promptSnap.docs) {
    const uid = getUid(doc);
    if (uid) ensure(uid).prompts.push(doc.data());
  }
  for (const doc of genSuccessSnap.docs) {
    const uid = getUid(doc);
    if (uid) ensure(uid).genSuccess.push(doc.data());
  }
  for (const doc of genFailSnap.docs) {
    const uid = getUid(doc);
    if (uid) ensure(uid).genFail.push(doc.data());
  }

  // Compute per-user stats
  const users: UserViewStats[] = [];
  for (const [uid, u] of Object.entries(byUser)) {
    if (u.prompts.length === 0) continue;

    const graphOpens = u.viewOpens.filter(e => e.view === "patch").length;
    const codeOpens = u.viewOpens.filter(e => e.view === "code").length;
    const graphCloses = u.viewCloses.filter(e => e.view === "patch");
    const codeCloses = u.viewCloses.filter(e => e.view === "code");

    const avgGraphDur = graphCloses.length > 0
      ? graphCloses.reduce((s, e) => s + ((e.durationMs as number) || 0), 0) / graphCloses.length
      : 0;
    const avgCodeDur = codeCloses.length > 0
      ? codeCloses.reduce((s, e) => s + ((e.durationMs as number) || 0), 0) / codeCloses.length
      : 0;

    const graphGlances = graphCloses.filter(e => e.wasGlance).length;
    const codeGlances = codeCloses.filter(e => e.wasGlance).length;

    const followUps = u.prompts.filter(e => e.isFollowUp).length;
    const totalGens = u.genSuccess.length + u.genFail.length;
    const successRate = totalGens > 0 ? u.genSuccess.length / totalGens : 0;

    let totalAttempts = 0;
    for (const g of u.genSuccess) {
      totalAttempts += (g.successAttempt as number) || 1;
    }
    const avgAttempts = u.genSuccess.length > 0 ? totalAttempts / u.genSuccess.length : 0;

    users.push({
      uid,
      email: u.email,
      promptCount: u.prompts.length,
      followUpCount: followUps,
      followUpRate: followUps / u.prompts.length,
      graphOpens,
      codeOpens,
      viewedGraph: graphOpens > 0,
      viewedCode: codeOpens > 0,
      avgGraphDurationMs: avgGraphDur,
      avgCodeDurationMs: avgCodeDur,
      graphGlanceRate: graphCloses.length > 0 ? graphGlances / graphCloses.length : 0,
      codeGlanceRate: codeCloses.length > 0 ? codeGlances / codeCloses.length : 0,
      totalGenerations: totalGens,
      successCount: u.genSuccess.length,
      successRate,
      avgAttemptsToSuccess: avgAttempts,
    });
  }

  // Temporal analysis: do view opens follow successes or failures?
  let graphAfterSuccess = 0, graphAfterFailure = 0, graphNoContext = 0;
  let codeAfterSuccess = 0, codeAfterFailure = 0, codeNoContext = 0;

  type TaggedEvent = EventData & { _type: "view_open" | "generation_success" | "generation_failure" };

  function toMs(ts: unknown): number {
    if (ts instanceof Object && "toMillis" in (ts as Record<string, unknown>)) {
      return (ts as { toMillis: () => number }).toMillis();
    }
    return new Date(ts as string).getTime();
  }

  for (const u of Object.values(byUser)) {
    const allEvents: TaggedEvent[] = [
      ...u.viewOpens.map(e => ({ ...e, _type: "view_open" as const })),
      ...u.genSuccess.map(e => ({ ...e, _type: "generation_success" as const })),
      ...u.genFail.map(e => ({ ...e, _type: "generation_failure" as const })),
    ];

    allEvents.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

    for (let i = 0; i < allEvents.length; i++) {
      const e = allEvents[i];
      if (e._type !== "view_open") continue;

      let foundGen: string | null = null;
      for (let j = i - 1; j >= 0; j--) {
        const prev = allEvents[j];
        if (prev._type === "generation_success" || prev._type === "generation_failure") {
          if (toMs(e.createdAt) - toMs(prev.createdAt) <= 120000) foundGen = prev._type;
          break;
        }
      }

      if (e.view === "patch") {
        if (!foundGen) graphNoContext++;
        else if (foundGen === "generation_success") graphAfterSuccess++;
        else graphAfterFailure++;
      } else if (e.view === "code") {
        if (!foundGen) codeNoContext++;
        else if (foundGen === "generation_success") codeAfterSuccess++;
        else codeAfterFailure++;
      }
    }
  }

  const totalGraphTemporal = graphAfterSuccess + graphAfterFailure;
  const totalCodeTemporal = codeAfterSuccess + codeAfterFailure;

  users.sort((a, b) => b.promptCount - a.promptCount);

  const withGraph = users.filter(u => u.viewedGraph);
  const noGraph = users.filter(u => !u.viewedGraph);
  const withCode = users.filter(u => u.viewedCode);
  const noCode = users.filter(u => !u.viewedCode);
  const withBoth = users.filter(u => u.viewedGraph && u.viewedCode);
  const withNeither = users.filter(u => !u.viewedGraph && !u.viewedCode);
  const n = users.length;

  return {
    totalUsersWithPrompts: n,

    graphViewerCount: withGraph.length,
    graphViewerPct: n > 0 ? withGraph.length / n : 0,
    codeViewerCount: withCode.length,
    codeViewerPct: n > 0 ? withCode.length / n : 0,
    bothViewerCount: withBoth.length,
    bothViewerPct: n > 0 ? withBoth.length / n : 0,
    neitherViewerCount: withNeither.length,
    neitherViewerPct: n > 0 ? withNeither.length / n : 0,

    avgGraphDurationMs: avg(withGraph.map(u => u.avgGraphDurationMs)),
    avgCodeDurationMs: avg(withCode.map(u => u.avgCodeDurationMs)),
    graphGlanceRate: avg(withGraph.map(u => u.graphGlanceRate)),
    codeGlanceRate: avg(withCode.map(u => u.codeGlanceRate)),
    totalGraphOpens: users.reduce((s, u) => s + u.graphOpens, 0),
    totalCodeOpens: users.reduce((s, u) => s + u.codeOpens, 0),

    followUpRate_graphViewers: avg(withGraph.map(u => u.followUpRate)),
    followUpRate_nonGraphViewers: avg(noGraph.map(u => u.followUpRate)),
    followUpRate_codeViewers: avg(withCode.map(u => u.followUpRate)),
    followUpRate_nonCodeViewers: avg(noCode.map(u => u.followUpRate)),

    successRate_graphViewers: avg(withGraph.map(u => u.successRate)),
    successRate_nonGraphViewers: avg(noGraph.map(u => u.successRate)),
    successRate_codeViewers: avg(withCode.map(u => u.successRate)),
    successRate_nonCodeViewers: avg(noCode.map(u => u.successRate)),

    avgAttempts_graphViewers: avg(withGraph.filter(u => u.avgAttemptsToSuccess > 0).map(u => u.avgAttemptsToSuccess)),
    avgAttempts_nonGraphViewers: avg(noGraph.filter(u => u.avgAttemptsToSuccess > 0).map(u => u.avgAttemptsToSuccess)),
    avgAttempts_codeViewers: avg(withCode.filter(u => u.avgAttemptsToSuccess > 0).map(u => u.avgAttemptsToSuccess)),
    avgAttempts_nonCodeViewers: avg(noCode.filter(u => u.avgAttemptsToSuccess > 0).map(u => u.avgAttemptsToSuccess)),

    temporal: {
      graphAfterSuccess,
      graphAfterFailure,
      graphNoContext,
      graphAfterSuccessPct: totalGraphTemporal > 0 ? graphAfterSuccess / totalGraphTemporal : 0,
      graphAfterFailurePct: totalGraphTemporal > 0 ? graphAfterFailure / totalGraphTemporal : 0,
      codeAfterSuccess,
      codeAfterFailure,
      codeNoContext,
      codeAfterSuccessPct: totalCodeTemporal > 0 ? codeAfterSuccess / totalCodeTemporal : 0,
      codeAfterFailurePct: totalCodeTemporal > 0 ? codeAfterFailure / totalCodeTemporal : 0,
    },

    users,
  };
}
