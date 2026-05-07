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
  totalGraphCloses: number;
  totalCodeCloses: number;

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

  // Deep comprehension analysis
  viewRateAfterSuccess: number;
  viewRateAfterFailure: number;
  viewCountAfterSuccess: number;
  viewCountAfterFailure: number;
  totalSuccesses: number;
  totalFailures: number;

  graphDurAfterSuccess: number;
  graphDurAfterFailure: number;
  graphGlanceRateAfterSuccess: number;
  graphGlanceRateAfterFailure: number;
  codeDurAfterSuccess: number;
  codeDurAfterFailure: number;
  codeGlanceRateAfterSuccess: number;
  codeGlanceRateAfterFailure: number;
  graphDurAfterSuccessN: number;
  graphDurAfterFailureN: number;
  codeDurAfterSuccessN: number;
  codeDurAfterFailureN: number;

  graphFirstCount: number;
  codeFirstCount: number;
  graphFirstPct: number;

  viewThenFollowUp: number;
  viewThenNoFollowUp: number;
  noViewThenFollowUp: number;
  noViewThenNoFollowUp: number;
  followUpRateViewers: number;
  followUpRateNonViewers: number;

  viewThenDownload: number;
  viewThenNoDownload: number;
  noViewThenDownload: number;
  noViewThenNoDownload: number;
  downloadRateViewers: number;
  downloadRateNonViewers: number;

  // Lagged: view at N → success at N+1
  viewedThenNextSuccess: number;
  viewedThenNextFail: number;
  noViewThenNextSuccess: number;
  noViewThenNextFail: number;
  nextSuccessRateViewers: number;
  nextSuccessRateNonViewers: number;

  // A/B test × view preference
  abTotalAssigned: number;
  abGraphFirstVariant: number;
  abCodeFirstVariant: number;
  abPreABUsers: number;
  abUsersWithViews: number;
  abGFLayoutUsers: number;
  abCFLayoutUsers: number;
  abGFLayoutGraphFirst: number;
  abGFLayoutCodeFirst: number;
  abCFLayoutGraphFirst: number;
  abCFLayoutCodeFirst: number;

  // Per-user table
  users: UserViewStats[];
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

export async function fetchResearchStats(): Promise<ResearchStats> {
  const [usersSnap, viewOpenSnap, viewCloseSnap, promptSnap, genSuccessSnap, genFailSnap, downloadSnap, expSnap] =
    await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "view_open"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "view_close"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "prompt_submitted"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "generation_success"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "generation_failure"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "download"))),
      getDocs(query(collectionGroup(db, "events"), where("event", "==", "experiment_assignment"))),
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
    downloads: EventData[];
    variant: string | null;
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
        viewOpens: [], viewCloses: [], prompts: [], genSuccess: [], genFail: [], downloads: [], variant: null,
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
  for (const doc of downloadSnap.docs) {
    const uid = getUid(doc);
    if (uid) ensure(uid).downloads.push(doc.data());
  }
  for (const doc of expSnap.docs) {
    const uid = getUid(doc);
    const d = doc.data();
    if (uid && d.experiment === "panel_order" && !ensure(uid).variant) {
      ensure(uid).variant = d.variant as string;
    }
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

  // Deep comprehension analysis using all events sorted by time per user
  let viewCountAfterSuccess = 0, totalSuccesses = 0;
  let viewCountAfterFailure = 0, totalFailures = 0;
  const graphDurAfterSuccessArr: number[] = [], graphDurAfterFailArr: number[] = [];
  const codeDurAfterSuccessArr: number[] = [], codeDurAfterFailArr: number[] = [];
  let graphGlanceAfterSuccessCount = 0, graphCloseAfterSuccessCount = 0;
  let graphGlanceAfterFailCount = 0, graphCloseAfterFailCount = 0;
  let codeGlanceAfterSuccessCount = 0, codeCloseAfterSuccessCount = 0;
  let codeGlanceAfterFailCount = 0, codeCloseAfterFailCount = 0;
  let graphFirstCount = 0, codeFirstCount = 0;
  let viewThenFollowUp = 0, viewThenNoFollowUp = 0;
  let noViewThenFollowUp = 0, noViewThenNoFollowUp = 0;
  let viewThenDownload = 0, viewThenNoDownload = 0;
  let noViewThenDownload = 0, noViewThenNoDownload = 0;
  let viewedThenNextSuccess = 0, viewedThenNextFail = 0;
  let noViewThenNextSuccess = 0, noViewThenNextFail = 0;

  type FullTaggedEvent = EventData & { _type: string };

  for (const u of Object.values(byUser)) {
    const all: FullTaggedEvent[] = [
      ...u.viewOpens.map(e => ({ ...e, _type: "view_open" })),
      ...u.viewCloses.map(e => ({ ...e, _type: "view_close" })),
      ...u.genSuccess.map(e => ({ ...e, _type: "generation_success" })),
      ...u.genFail.map(e => ({ ...e, _type: "generation_failure" })),
      ...u.prompts.map(e => ({ ...e, _type: "prompt_submitted" })),
      ...u.downloads.map(e => ({ ...e, _type: "download" })),
    ];
    all.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

    const genIndices: number[] = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i]._type === "generation_success" || all[i]._type === "generation_failure") {
        genIndices.push(i);
      }
    }

    for (let gi = 0; gi < genIndices.length; gi++) {
      const idx = genIndices[gi];
      const gen = all[idx];
      const genTime = toMs(gen.createdAt);
      const isSuccess = gen._type === "generation_success";
      if (isSuccess) totalSuccesses++; else totalFailures++;

      let didView = false, didFollowUp = false, didDownload = false;
      let firstGraphT: number | null = null, firstCodeT: number | null = null;
      const nextGenIdx = gi < genIndices.length - 1 ? genIndices[gi + 1] : all.length;

      for (let j = idx + 1; j < nextGenIdx && j < all.length; j++) {
        const e = all[j];
        const t = toMs(e.createdAt);
        if (t - genTime > 300000) break;

        if (e._type === "view_open") {
          didView = true;
          if (isSuccess) {
            if (e.view === "patch" && firstGraphT === null) firstGraphT = t;
            if (e.view === "code" && firstCodeT === null) firstCodeT = t;
          }
        }
        if (e._type === "view_close" && (e.durationMs as number) > 0) {
          if (e.view === "patch") {
            if (isSuccess) {
              graphDurAfterSuccessArr.push(e.durationMs as number);
              graphCloseAfterSuccessCount++;
              if (e.wasGlance) graphGlanceAfterSuccessCount++;
            } else {
              graphDurAfterFailArr.push(e.durationMs as number);
              graphCloseAfterFailCount++;
              if (e.wasGlance) graphGlanceAfterFailCount++;
            }
          } else if (e.view === "code") {
            if (isSuccess) {
              codeDurAfterSuccessArr.push(e.durationMs as number);
              codeCloseAfterSuccessCount++;
              if (e.wasGlance) codeGlanceAfterSuccessCount++;
            } else {
              codeDurAfterFailArr.push(e.durationMs as number);
              codeCloseAfterFailCount++;
              if (e.wasGlance) codeGlanceAfterFailCount++;
            }
          }
        }
        if (e._type === "prompt_submitted" && e.isFollowUp) didFollowUp = true;
        if (e._type === "download") didDownload = true;
      }

      if (isSuccess) {
        if (didView) viewCountAfterSuccess++; else { /* no-view after success */ }
        if (firstGraphT !== null && firstCodeT !== null) {
          if (firstGraphT <= firstCodeT) graphFirstCount++; else codeFirstCount++;
        } else if (firstGraphT !== null) graphFirstCount++;
        else if (firstCodeT !== null) codeFirstCount++;
      } else {
        if (didView) viewCountAfterFailure++;
      }

      if (didView && didFollowUp) viewThenFollowUp++;
      if (didView && !didFollowUp) viewThenNoFollowUp++;
      if (!didView && didFollowUp) noViewThenFollowUp++;
      if (!didView && !didFollowUp) noViewThenNoFollowUp++;

      if (didView && didDownload) viewThenDownload++;
      if (didView && !didDownload) viewThenNoDownload++;
      if (!didView && didDownload) noViewThenDownload++;
      if (!didView && !didDownload) noViewThenNoDownload++;

      // Lagged: view at N → success at N+1
      if (gi < genIndices.length - 1) {
        const nextGen = all[genIndices[gi + 1]];
        if (didView) {
          if (nextGen._type === "generation_success") viewedThenNextSuccess++;
          else viewedThenNextFail++;
        } else {
          if (nextGen._type === "generation_success") noViewThenNextSuccess++;
          else noViewThenNextFail++;
        }
      }
    }
  }

  const totalViewedDeep = viewThenFollowUp + viewThenNoFollowUp;
  const totalNoViewDeep = noViewThenFollowUp + noViewThenNoFollowUp;
  const totalViewedLagged = viewedThenNextSuccess + viewedThenNextFail;
  const totalNoViewLagged = noViewThenNextSuccess + noViewThenNextFail;
  const totalFirstView = graphFirstCount + codeFirstCount;
  const totalViewedDl = viewThenDownload + viewThenNoDownload;
  const totalNoViewDl = noViewThenDownload + noViewThenNoDownload;

  // A/B test × view preference
  let abGraphFirstVariant = 0, abCodeFirstVariant = 0, abPreABUsers = 0;
  let abGFLayoutGraphFirst = 0, abGFLayoutCodeFirst = 0;
  let abCFLayoutGraphFirst = 0, abCFLayoutCodeFirst = 0;
  const abUsersWithViewsSet = new Set<string>();

  for (const [uid, u] of Object.entries(byUser)) {
    if (u.prompts.length === 0) continue;
    if (!u.variant) { abPreABUsers++; continue; }
    if (u.variant === "graph-first") abGraphFirstVariant++;
    else abCodeFirstVariant++;

    const allAB: FullTaggedEvent[] = [
      ...u.viewOpens.map(e => ({ ...e, _type: "view_open" })),
      ...u.genSuccess.map(e => ({ ...e, _type: "generation_success" })),
      ...u.genFail.map(e => ({ ...e, _type: "generation_failure" })),
    ];
    allAB.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
    const abGenIdx: number[] = [];
    for (let i = 0; i < allAB.length; i++) {
      if (allAB[i]._type === "generation_success" || allAB[i]._type === "generation_failure") abGenIdx.push(i);
    }
    for (let gi = 0; gi < abGenIdx.length; gi++) {
      const idx = abGenIdx[gi];
      if (allAB[idx]._type !== "generation_success") continue;
      const genTime = toMs(allAB[idx].createdAt);
      const nextIdx = gi < abGenIdx.length - 1 ? abGenIdx[gi + 1] : allAB.length;
      let fgT: number | null = null, fcT: number | null = null;
      for (let j = idx + 1; j < nextIdx && j < allAB.length; j++) {
        const e = allAB[j];
        if (toMs(e.createdAt) - genTime > 300000) break;
        if (e._type === "view_open") {
          if (e.view === "patch" && fgT === null) fgT = toMs(e.createdAt);
          if (e.view === "code" && fcT === null) fcT = toMs(e.createdAt);
        }
      }
      let clicked: "graph" | "code" | null = null;
      if (fgT !== null && fcT !== null) clicked = fgT <= fcT ? "graph" : "code";
      else if (fgT !== null) clicked = "graph";
      else if (fcT !== null) clicked = "code";
      if (!clicked) continue;
      abUsersWithViewsSet.add(uid);
      if (u.variant === "graph-first") {
        if (clicked === "graph") abGFLayoutGraphFirst++; else abGFLayoutCodeFirst++;
      } else {
        if (clicked === "graph") abCFLayoutGraphFirst++; else abCFLayoutCodeFirst++;
      }
    }
  }

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
    totalGraphCloses: Object.values(byUser).reduce((s, u) => s + u.viewCloses.filter(e => e.view === "patch").length, 0),
    totalCodeCloses: Object.values(byUser).reduce((s, u) => s + u.viewCloses.filter(e => e.view === "code").length, 0),

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

    viewRateAfterSuccess: totalSuccesses > 0 ? viewCountAfterSuccess / totalSuccesses : 0,
    viewRateAfterFailure: totalFailures > 0 ? viewCountAfterFailure / totalFailures : 0,
    viewCountAfterSuccess,
    viewCountAfterFailure,
    totalSuccesses,
    totalFailures,

    graphDurAfterSuccess: avg(graphDurAfterSuccessArr),
    graphDurAfterFailure: avg(graphDurAfterFailArr),
    graphGlanceRateAfterSuccess: graphCloseAfterSuccessCount > 0 ? graphGlanceAfterSuccessCount / graphCloseAfterSuccessCount : 0,
    graphGlanceRateAfterFailure: graphCloseAfterFailCount > 0 ? graphGlanceAfterFailCount / graphCloseAfterFailCount : 0,
    codeDurAfterSuccess: avg(codeDurAfterSuccessArr),
    codeDurAfterFailure: avg(codeDurAfterFailArr),
    codeGlanceRateAfterSuccess: codeCloseAfterSuccessCount > 0 ? codeGlanceAfterSuccessCount / codeCloseAfterSuccessCount : 0,
    codeGlanceRateAfterFailure: codeCloseAfterFailCount > 0 ? codeGlanceAfterFailCount / codeCloseAfterFailCount : 0,
    graphDurAfterSuccessN: graphDurAfterSuccessArr.length,
    graphDurAfterFailureN: graphDurAfterFailArr.length,
    codeDurAfterSuccessN: codeDurAfterSuccessArr.length,
    codeDurAfterFailureN: codeDurAfterFailArr.length,

    graphFirstCount,
    codeFirstCount,
    graphFirstPct: totalFirstView > 0 ? graphFirstCount / totalFirstView : 0,

    viewThenFollowUp,
    viewThenNoFollowUp,
    noViewThenFollowUp,
    noViewThenNoFollowUp,
    followUpRateViewers: totalViewedDeep > 0 ? viewThenFollowUp / totalViewedDeep : 0,
    followUpRateNonViewers: totalNoViewDeep > 0 ? noViewThenFollowUp / totalNoViewDeep : 0,

    viewThenDownload,
    viewThenNoDownload,
    noViewThenDownload,
    noViewThenNoDownload,
    downloadRateViewers: totalViewedDl > 0 ? viewThenDownload / totalViewedDl : 0,
    downloadRateNonViewers: totalNoViewDl > 0 ? noViewThenDownload / totalNoViewDl : 0,

    viewedThenNextSuccess,
    viewedThenNextFail,
    noViewThenNextSuccess,
    noViewThenNextFail,
    nextSuccessRateViewers: totalViewedLagged > 0 ? viewedThenNextSuccess / totalViewedLagged : 0,
    nextSuccessRateNonViewers: totalNoViewLagged > 0 ? noViewThenNextSuccess / totalNoViewLagged : 0,

    abTotalAssigned: abGraphFirstVariant + abCodeFirstVariant,
    abGraphFirstVariant,
    abCodeFirstVariant,
    abPreABUsers,
    abUsersWithViews: abUsersWithViewsSet.size,
    abGFLayoutUsers: users.filter(u => byUser[u.uid]?.variant === "graph-first" && (u.graphOpens > 0 || u.codeOpens > 0)).length,
    abCFLayoutUsers: users.filter(u => byUser[u.uid]?.variant === "code-first" && (u.graphOpens > 0 || u.codeOpens > 0)).length,
    abGFLayoutGraphFirst,
    abGFLayoutCodeFirst,
    abCFLayoutGraphFirst,
    abCFLayoutCodeFirst,

    users,
  };
}
