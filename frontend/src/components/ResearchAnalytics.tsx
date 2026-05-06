import { useState, useEffect } from "react";
import { fetchResearchStats, type ResearchStats } from "../lib/adminResearch";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ms(n: number): string {
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
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
            <div className="admin-stat-sub">{pct(stats.graphGlanceRate)} glance rate (n={stats.totalGraphCloses})</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{ms(stats.avgCodeDurationMs)}</div>
            <div className="admin-stat-label">Avg Code Duration</div>
            <div className="admin-stat-sub">{pct(stats.codeGlanceRate)} glance rate (n={stats.totalCodeCloses})</div>
          </div>
        </div>
      </div>

      {/* Which view first */}
      <div className="rs-section">
        <div className="rs-section-title">
          View Preference: Which representation do users reach for first?
        </div>

        <div className="admin-grid admin-grid-3">
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(stats.graphFirstPct)}</div>
            <div className="admin-stat-label">Graph Opened First</div>
            <div className="admin-stat-sub">{stats.graphFirstCount} times</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(1 - stats.graphFirstPct)}</div>
            <div className="admin-stat-label">Code Opened First</div>
            <div className="admin-stat-sub">{stats.codeFirstCount} times</div>
          </div>
        </div>

        <div className="rs-finding" style={{ marginTop: 12 }}>
          <strong>Finding:</strong> After a successful generation, users open the
          graph <strong>{pct(stats.graphFirstPct)}</strong> of the time before code
          ({stats.graphFirstCount} / {stats.graphFirstCount + stats.codeFirstCount} instances) —
          the visual IR is the instinctive first choice for understanding output.
        </div>
      </div>

      {/* Temporal Analysis — commented out for now
      <div className="rs-section">
        <div className="rs-section-title">
          Temporal Analysis: When do users open views?
        </div>
        <p className="rs-insight">
          Do users inspect the graph/code to <strong>understand successful outputs</strong> or
          to <strong>debug failures</strong>? For each view_open event, we check
          whether the preceding generation (within 2 min) was a success or failure.
        </p>

        <div className="rs-table-group">
          <h4>Graph View Opens</h4>
          <table className="rs-table">
            <thead>
              <tr>
                <th>Context</th>
                <th>Count</th>
                <th>% of Contextual</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>After successful generation</td>
                <td>{stats.temporal.graphAfterSuccess}</td>
                <td className="rs-yes">{pct(stats.temporal.graphAfterSuccessPct)}</td>
              </tr>
              <tr>
                <td>After failed generation</td>
                <td>{stats.temporal.graphAfterFailure}</td>
                <td className="rs-no">{pct(stats.temporal.graphAfterFailurePct)}</td>
              </tr>
              <tr>
                <td className="rs-muted">No recent generation (browsing)</td>
                <td className="rs-muted">{stats.temporal.graphNoContext}</td>
                <td className="rs-muted">—</td>
              </tr>
              <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
                <td>Total contextual</td>
                <td>{stats.temporal.graphAfterSuccess + stats.temporal.graphAfterFailure}</td>
                <td>100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rs-table-group">
          <h4>Code View Opens</h4>
          <table className="rs-table">
            <thead>
              <tr>
                <th>Context</th>
                <th>Count</th>
                <th>% of Contextual</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>After successful generation</td>
                <td>{stats.temporal.codeAfterSuccess}</td>
                <td className="rs-yes">{pct(stats.temporal.codeAfterSuccessPct)}</td>
              </tr>
              <tr>
                <td>After failed generation</td>
                <td>{stats.temporal.codeAfterFailure}</td>
                <td className="rs-no">{pct(stats.temporal.codeAfterFailurePct)}</td>
              </tr>
              <tr>
                <td className="rs-muted">No recent generation (browsing)</td>
                <td className="rs-muted">{stats.temporal.codeNoContext}</td>
                <td className="rs-muted">—</td>
              </tr>
              <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
                <td>Total contextual</td>
                <td>{stats.temporal.codeAfterSuccess + stats.temporal.codeAfterFailure}</td>
                <td>100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rs-finding">
          <strong>Finding:</strong> {pct(stats.temporal.graphAfterSuccessPct)} of
          contextual graph opens ({stats.temporal.graphAfterSuccess} / {stats.temporal.graphAfterSuccess + stats.temporal.graphAfterFailure})
          and {pct(stats.temporal.codeAfterSuccessPct)} of contextual code opens ({stats.temporal.codeAfterSuccess} / {stats.temporal.codeAfterSuccess + stats.temporal.codeAfterFailure})
          follow a successful generation — users primarily use these views
          as <strong>comprehension tools</strong> to understand and verify outputs,
          not to debug failures.
        </div>
      </div>
      */}

      {/* Evidence: NOT used for debugging */}
      <div className="rs-section">
        <div className="rs-section-title">
          Evidence: Views are NOT used for debugging
        </div>
        <p className="rs-insight">
          After a generation, how often do users open a view?
          If views were debugging tools, we would expect higher view rates after failures.
        </p>

        <div className="admin-grid admin-grid-4">
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(stats.viewRateAfterSuccess)}</div>
            <div className="admin-stat-label">View Rate After Success</div>
            <div className="admin-stat-sub">{stats.viewCountAfterSuccess} / {stats.totalSuccesses} successes</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(stats.viewRateAfterFailure)}</div>
            <div className="admin-stat-label">View Rate After Failure</div>
            <div className="admin-stat-sub">{stats.viewCountAfterFailure} / {stats.totalFailures} failures</div>
          </div>
        </div>

        <div className="rs-finding" style={{ marginTop: 12 }}>
          <strong>Finding:</strong> Users are{" "}
          {stats.viewRateAfterSuccess > 0 && stats.viewRateAfterFailure > 0
            ? `${(stats.viewRateAfterSuccess / stats.viewRateAfterFailure).toFixed(1)}x`
            : "—"}{" "}
          more likely to open a view after <strong>success</strong> than after failure.
          Views are not used for debugging.
        </div>
      </div>

      {/* View depth: duration & glance rates */}
      <div className="rs-section">
        <div className="rs-section-title">
          View Depth: How long do users inspect?
        </div>

        <div className="rs-table-group">
          <h4>Graph View Duration</h4>
          <table className="rs-table">
            <thead>
              <tr>
                <th>Context</th>
                <th>Avg Duration</th>
                <th>Glance Rate</th>
                <th>N</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>After success</td>
                <td>{ms(stats.graphDurAfterSuccess)}</td>
                <td>{pct(stats.graphGlanceRateAfterSuccess)}</td>
                <td>{stats.graphDurAfterSuccessN}</td>
              </tr>
              <tr>
                <td>After failure</td>
                <td>{stats.graphDurAfterFailureN > 0 ? ms(stats.graphDurAfterFailure) : "—"}</td>
                <td>{stats.graphDurAfterFailureN > 0 ? pct(stats.graphGlanceRateAfterFailure) : "—"}</td>
                <td>{stats.graphDurAfterFailureN}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rs-table-group">
          <h4>Code View Duration</h4>
          <table className="rs-table">
            <thead>
              <tr>
                <th>Context</th>
                <th>Avg Duration</th>
                <th>Glance Rate</th>
                <th>N</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>After success</td>
                <td>{ms(stats.codeDurAfterSuccess)}</td>
                <td>{pct(stats.codeGlanceRateAfterSuccess)}</td>
                <td>{stats.codeDurAfterSuccessN}</td>
              </tr>
              <tr>
                <td>After failure</td>
                <td>{stats.codeDurAfterFailureN > 0 ? ms(stats.codeDurAfterFailure) : "—"}</td>
                <td>{stats.codeDurAfterFailureN > 0 ? pct(stats.codeGlanceRateAfterFailure) : "—"}</td>
                <td>{stats.codeDurAfterFailureN}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rs-finding">
          <strong>Finding:</strong> Graph views average {ms(stats.graphDurAfterSuccess)} with{" "}
          {pct(stats.graphGlanceRateAfterSuccess)} glance rate — users study the graph.
          Code views average {ms(stats.codeDurAfterSuccess)} with{" "}
          {pct(stats.codeGlanceRateAfterSuccess)} glance rate — mostly quick peeks.
          The visual IR is the preferred comprehension tool.
        </div>
      </div>

      {/* Comprehension → iteration */}
      <div className="rs-section">
        <div className="rs-section-title">
          Comprehension → Iteration: Does viewing lead to follow-up prompts?
        </div>

        <div className="rs-table-group">
          <table className="rs-table">
            <thead>
              <tr>
                <th>After Success</th>
                <th>Follow-up Rate</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Viewed, then followed up</td>
                <td className="rs-yes">{pct(stats.followUpRateViewers)}</td>
                <td>{stats.viewThenFollowUp} / {stats.viewThenFollowUp + stats.viewThenNoFollowUp}</td>
              </tr>
              <tr>
                <td>Did not view, then followed up</td>
                <td>{pct(stats.followUpRateNonViewers)}</td>
                <td>{stats.noViewThenFollowUp} / {stats.noViewThenFollowUp + stats.noViewThenNoFollowUp}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Comprehension → download */}
      <div className="rs-section">
        <div className="rs-section-title">
          Comprehension → Download: Does viewing build confidence?
        </div>

        <div className="rs-table-group">
          <table className="rs-table">
            <thead>
              <tr>
                <th>After Success</th>
                <th>Download Rate</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Viewed, then downloaded</td>
                <td className="rs-yes">{pct(stats.downloadRateViewers)}</td>
                <td>{stats.viewThenDownload} / {stats.viewThenDownload + stats.viewThenNoDownload}</td>
              </tr>
              <tr>
                <td>Did not view, then downloaded</td>
                <td>{pct(stats.downloadRateNonViewers)}</td>
                <td>{stats.noViewThenDownload} / {stats.noViewThenDownload + stats.noViewThenNoDownload}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Lagged: view at N → success at N+1 */}
      <div className="rs-section">
        <div className="rs-section-title">
          Lagged Analysis: Does viewing improve the next generation?
        </div>
        <p className="rs-insight">
          If viewing the IR helps users understand the output, they should construct
          better follow-up prompts — leading to higher success on the <strong>next</strong> generation.
        </p>

        <div className="admin-grid admin-grid-3">
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(stats.nextSuccessRateViewers)}</div>
            <div className="admin-stat-label">N+1 Success (viewed)</div>
            <div className="admin-stat-sub">{stats.viewedThenNextSuccess} / {stats.viewedThenNextSuccess + stats.viewedThenNextFail}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{pct(stats.nextSuccessRateNonViewers)}</div>
            <div className="admin-stat-label">N+1 Success (no view)</div>
            <div className="admin-stat-sub">{stats.noViewThenNextSuccess} / {stats.noViewThenNextSuccess + stats.noViewThenNextFail}</div>
          </div>
        </div>

        <div className="rs-finding" style={{ marginTop: 12 }}>
          <strong>Finding:</strong> Users who viewed the IR after generation N had
          a <strong>{pct(stats.nextSuccessRateViewers)}</strong> success rate on generation N+1
          ({stats.viewedThenNextSuccess} / {stats.viewedThenNextSuccess + stats.viewedThenNextFail}),
          vs <strong>{pct(stats.nextSuccessRateNonViewers)}</strong> for non-viewers
          ({stats.noViewThenNextSuccess} / {stats.noViewThenNextSuccess + stats.noViewThenNextFail}) —
          a <strong>+{pct(stats.nextSuccessRateViewers - stats.nextSuccessRateNonViewers)}</strong> difference.
          Viewing the IR appears to help users construct more effective prompts.
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
