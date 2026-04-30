import { useState, useEffect } from "react";
import { fetchResearchStats, type ResearchStats } from "../lib/adminResearch";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ms(n: number): string {
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function CorrelationRow({
  label,
  withVal,
  withoutVal,
  fmt,
}: {
  label: string;
  withVal: number;
  withoutVal: number;
  fmt: (n: number) => string;
}) {
  const diff = withVal - withoutVal;
  const arrow = diff > 0.01 ? "higher" : diff < -0.01 ? "lower" : "same";
  return (
    <tr>
      <td>{label}</td>
      <td>{fmt(withVal)}</td>
      <td>{fmt(withoutVal)}</td>
      <td className={`rs-diff rs-diff-${arrow}`}>
        {arrow === "higher" && "+"}
        {fmt(Math.abs(diff))} {arrow}
      </td>
    </tr>
  );
}

export function ResearchAnalytics() {
  const [stats, setStats] = useState<ResearchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    fetchResearchStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="rs-loading">Loading research data...</div>;
  if (error) return <div className="rs-error">Error: {error}</div>;
  if (!stats) return null;

  return (
    <div className="rs-container">
      {/* RQ1 */}
      <div className="rs-section">
        <div className="rs-section-title">
          RQ1: How do users engage with the graph and code views?
        </div>

        <div className="rs-summary">
          <span className="rs-big">{stats.totalUsersWithPrompts}</span> users with prompts
        </div>

        <div className="admin-grid admin-grid-4">
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(stats.graphViewerPct)}</div>
            <div className="admin-stat-label">Viewed Graph</div>
            <div className="admin-stat-sub">{stats.graphViewerCount} users</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(stats.codeViewerPct)}</div>
            <div className="admin-stat-label">Viewed Code</div>
            <div className="admin-stat-sub">{stats.codeViewerCount} users</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(stats.bothViewerPct)}</div>
            <div className="admin-stat-label">Viewed Both</div>
            <div className="admin-stat-sub">{stats.bothViewerCount} users</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(stats.neitherViewerPct)}</div>
            <div className="admin-stat-label">Viewed Neither</div>
            <div className="admin-stat-sub">{stats.neitherViewerCount} users</div>
          </div>
        </div>

        <div className="admin-grid admin-grid-4" style={{ marginTop: 12 }}>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{stats.totalGraphOpens}</div>
            <div className="admin-stat-label">Total Graph Opens</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{stats.totalCodeOpens}</div>
            <div className="admin-stat-label">Total Code Opens</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{ms(stats.avgGraphDurationMs)}</div>
            <div className="admin-stat-label">Avg Graph Duration</div>
            <div className="admin-stat-sub">{pct(stats.graphGlanceRate)} glance rate</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{ms(stats.avgCodeDurationMs)}</div>
            <div className="admin-stat-label">Avg Code Duration</div>
            <div className="admin-stat-sub">{pct(stats.codeGlanceRate)} glance rate</div>
          </div>
        </div>
      </div>

      {/* RQ2 */}
      <div className="rs-section">
        <div className="rs-section-title">
          RQ2: Does view engagement correlate with iteration and success?
        </div>

        <div className="rs-table-group">
          <h4>Follow-up Rate (iteration)</h4>
          <table className="rs-table">
            <thead>
              <tr>
                <th>View</th>
                <th>Viewers</th>
                <th>Non-viewers</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              <CorrelationRow
                label="Graph"
                withVal={stats.followUpRate_graphViewers}
                withoutVal={stats.followUpRate_nonGraphViewers}
                fmt={pct}
              />
              <CorrelationRow
                label="Code"
                withVal={stats.followUpRate_codeViewers}
                withoutVal={stats.followUpRate_nonCodeViewers}
                fmt={pct}
              />
            </tbody>
          </table>
        </div>

        <div className="rs-table-group">
          <h4>Generation Success Rate</h4>
          <table className="rs-table">
            <thead>
              <tr>
                <th>View</th>
                <th>Viewers</th>
                <th>Non-viewers</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              <CorrelationRow
                label="Graph"
                withVal={stats.successRate_graphViewers}
                withoutVal={stats.successRate_nonGraphViewers}
                fmt={pct}
              />
              <CorrelationRow
                label="Code"
                withVal={stats.successRate_codeViewers}
                withoutVal={stats.successRate_nonCodeViewers}
                fmt={pct}
              />
            </tbody>
          </table>
        </div>

        <div className="rs-table-group">
          <h4>Avg Attempts to Success (retry effort)</h4>
          <table className="rs-table">
            <thead>
              <tr>
                <th>View</th>
                <th>Viewers</th>
                <th>Non-viewers</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              <CorrelationRow
                label="Graph"
                withVal={stats.avgAttempts_graphViewers}
                withoutVal={stats.avgAttempts_nonGraphViewers}
                fmt={(n) => n.toFixed(2)}
              />
              <CorrelationRow
                label="Code"
                withVal={stats.avgAttempts_codeViewers}
                withoutVal={stats.avgAttempts_nonCodeViewers}
                fmt={(n) => n.toFixed(2)}
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-user table */}
      <div className="rs-section">
        <div className="rs-section-title rs-toggle" onClick={() => setShowTable(!showTable)}>
          <span className={`rs-arrow ${showTable ? "rs-arrow-open" : ""}`}>&#9654;</span>
          Per-User Breakdown ({stats.users.length} users)
        </div>

        {showTable && (
          <div className="rs-user-table-wrap">
            <table className="rs-table rs-table-users">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Prompts</th>
                  <th>Follow-up %</th>
                  <th>Graph</th>
                  <th>Code</th>
                  <th>Avg Graph Dur</th>
                  <th>Avg Code Dur</th>
                  <th>Gens</th>
                  <th>Success %</th>
                  <th>Avg Attempts</th>
                </tr>
              </thead>
              <tbody>
                {stats.users.map((u) => (
                  <tr key={u.uid}>
                    <td className="rs-email">{u.email}</td>
                    <td>{u.promptCount}</td>
                    <td>{pct(u.followUpRate)}</td>
                    <td className={u.viewedGraph ? "rs-yes" : "rs-no"}>
                      {u.graphOpens || "—"}
                    </td>
                    <td className={u.viewedCode ? "rs-yes" : "rs-no"}>
                      {u.codeOpens || "—"}
                    </td>
                    <td>{u.avgGraphDurationMs > 0 ? ms(u.avgGraphDurationMs) : "—"}</td>
                    <td>{u.avgCodeDurationMs > 0 ? ms(u.avgCodeDurationMs) : "—"}</td>
                    <td>{u.totalGenerations}</td>
                    <td>{u.totalGenerations > 0 ? pct(u.successRate) : "—"}</td>
                    <td>{u.avgAttemptsToSuccess > 0 ? u.avgAttemptsToSuccess.toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
