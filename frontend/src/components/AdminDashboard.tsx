import { useState, useEffect } from "react";
import { fetchAdminStats, type AdminStats } from "../lib/adminQueries";
import { UserJourneys } from "./UserJourneys";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function num(n: number, decimals = 0): string {
  return n.toFixed(decimals);
}

function ms(n: number): string {
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  );
}

type AdminTab = "stats" | "journeys";

export function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>("stats");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    fetchAdminStats()
      .then((s) => {
        setStats(s);
        setLastUpdated(new Date());
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load stats"))
      .finally(() => setLoading(false));
  };

  // Fetch on mount — refresh() calls setState in the .then callback (async),
  // not synchronously in the effect body, so this is safe.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, []);

  if (loading && !stats) {
    return (
      <div className="admin-dashboard">
        <div className="admin-loading">Loading research stats...</div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="admin-dashboard">
        <div className="admin-error">Error: {error}</div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h2>Research Dashboard</h2>
        <div className="admin-header-right">
          {lastUpdated && tab === "stats" && (
            <span className="admin-timestamp">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {tab === "stats" && (
            <button className="admin-refresh" onClick={refresh} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          )}
        </div>
      </div>

      <div className="admin-tabs">
        <button className={tab === "stats" ? "admin-tab-active" : ""} onClick={() => setTab("stats")}>
          Overview
        </button>
        <button className={tab === "journeys" ? "admin-tab-active" : ""} onClick={() => setTab("journeys")}>
          User Journeys
        </button>
      </div>

      {tab === "journeys" && <UserJourneys />}

      {tab === "stats" && <>
      {/* Overview */}
      <div className="admin-section">
        <div className="admin-section-title">Overview</div>
        <div className="admin-grid admin-grid-4">
          <StatCard label="Total Users" value={stats.totalUsers} />
          <StatCard label="Sessions" value={stats.totalSessions} />
          <StatCard label="Plugins Created" value={stats.totalPluginsCreated} />
          <StatCard label="Generations" value={stats.totalGenerations} />
        </div>
      </div>

      {/* Generation Performance */}
      <div className="admin-section">
        <div className="admin-section-title">Generation Performance</div>
        <div className="admin-grid admin-grid-4">
          <StatCard label="Success Rate" value={pct(stats.successRate)} sub={`${stats.successCount} ok / ${stats.failureCount} fail`} />
          <StatCard label="Avg Attempts" value={num(stats.avgAttemptsToSuccess, 1)} sub="attempts to success" />
          <StatCard label="Self-Correction" value={pct(stats.selfCorrectionRate)} sub="succeeded after retry" />
          <StatCard label="Retry Attempts" value={stats.retryAttempts} sub={`${stats.retryByType.extraction} ext / ${stats.retryByType.execution} exe`} />
        </div>
      </div>

      {/* Prompt Analysis */}
      <div className="admin-section">
        <div className="admin-section-title">Prompt Analysis</div>
        <div className="admin-grid admin-grid-4">
          <StatCard label="Avg Length" value={`${num(stats.avgPromptLength)} chars`} sub={`${stats.promptCount} prompts`} />
          <StatCard label="Avg Words" value={num(stats.avgWordCount, 1)} />
          <StatCard label="Template-based" value={pct(stats.templateRate)} />
          <StatCard label="Follow-up Rate" value={pct(stats.followUpRate)} />
        </div>
      </div>

      {/* Engagement */}
      <div className="admin-section">
        <div className="admin-section-title">User Engagement</div>
        <div className="admin-grid admin-grid-3">
          <StatCard label="Graph Views" value={stats.graphViewCount} sub={stats.totalGenerations > 0 ? `${pct(stats.graphViewCount / stats.totalGenerations)} of gens` : ""} />
          <StatCard label="Code Views" value={stats.codeViewCount} sub={stats.totalGenerations > 0 ? `${pct(stats.codeViewCount / stats.totalGenerations)} of gens` : ""} />
          <StatCard label="Avg View Duration" value={ms(stats.avgViewDurationMs)} />
          <StatCard label="Glance Rate" value={pct(stats.glanceRate)} sub="< 3s views" />
          <StatCard label="Fullscreen Opens" value={stats.fullscreenCount} />
          <StatCard label="Graph Interactions" value={stats.graphInteractCount} sub="zoom/pan/click" />
        </div>
      </div>

      {/* Satisfaction */}
      <div className="admin-section">
        <div className="admin-section-title">Satisfaction</div>
        <div className="admin-grid admin-grid-3">
          <StatCard label="Thumbs Up" value={stats.thumbsUp} />
          <StatCard label="Thumbs Down" value={stats.thumbsDown} />
          <StatCard label="Satisfaction Rate" value={pct(stats.satisfactionRate)} />
        </div>
      </div>

      {/* Downloads & Validation */}
      <div className="admin-section">
        <div className="admin-section-title">Downloads & Validation</div>
        <div className="admin-grid admin-grid-3">
          <StatCard label="Total Downloads" value={stats.totalDownloads} />
          <StatCard label="With Warnings" value={stats.downloadsWithWarnings} sub={stats.totalDownloads > 0 ? pct(stats.downloadsWithWarnings / stats.totalDownloads) : ""} />
          <StatCard label="Validation Expanded" value={stats.validationExpandCount} />
        </div>
      </div>
      </>}
    </div>
  );
}
