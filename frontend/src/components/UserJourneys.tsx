import { useState, useEffect, useMemo } from "react";
import {
  fetchUserJourneys,
  type UserJourney,
  type UserEvent,
} from "../lib/adminUserJourneys";

type FilterType = "all" | "power" | "regular" | "browser";

function classify(u: UserJourney): "power" | "regular" | "browser" {
  if (u.prompts.length >= 5) return "power";
  if (u.prompts.length >= 2) return "regular";
  return "browser";
}

function dotClass(e: UserEvent): string {
  if (e.event === "prompt_submitted") return "uj-dot-prompt";
  if (
    e.event?.includes("generation") ||
    e.event?.includes("plugin_create") ||
    e.event === "code_executed"
  )
    return "uj-dot-gen";
  if (e.event?.includes("view_") || e.event === "page_view")
    return "uj-dot-view";
  if (e.event?.includes("download") || e.event?.includes("export"))
    return "uj-dot-dl";
  if (
    e.event?.includes("click") ||
    e.event?.includes("scroll") ||
    e.event?.includes("select") ||
    e.event?.includes("toggle")
  )
    return "uj-dot-click";
  if (e.event?.includes("error") || e.event?.includes("fail"))
    return "uj-dot-err";
  return "uj-dot-other";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function sessionDuration(events: UserEvent[]): string {
  if (events.length < 2) return "";
  const ms =
    new Date(events[events.length - 1].createdAt).getTime() -
    new Date(events[0].createdAt).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function describeEvent(
  e: UserEvent,
  prompts: UserJourney["prompts"],
): string {
  switch (e.event) {
    case "prompt_submitted": {
      const et = new Date(e.createdAt).getTime();
      let text = `${e.wordCount || "?"} words`;
      for (const p of prompts) {
        if (Math.abs(new Date(p.createdAt).getTime() - et) < 5000) {
          text = `"${p.prompt}"`;
          break;
        }
      }
      const tmpl = e.hasTemplateContext
        ? ` (template: ${e.templateUsed || "yes"})`
        : "";
      const follow = e.isFollowUp ? " [follow-up]" : "";
      return `${text}${tmpl}${follow}`;
    }
    case "generation_success":
      return "Generation succeeded";
    case "generation_error":
    case "generation_failure":
      return `Generation failed: ${e.errorType || "error"}`;
    case "code_executed":
      return `Code executed${e.success === false ? " (FAIL)" : ""}`;
    case "plugin_create":
      return `Plugin created${e.pluginName ? ": " + e.pluginName : ""}`;
    case "plugin_download":
    case "download":
      return "Downloaded .amxd";
    case "view_open":
      return `Opened ${e.view || "view"}`;
    case "view_close": {
      const dur = e.durationMs ? ` (${(e.durationMs / 1000).toFixed(1)}s)` : "";
      const gl = e.wasGlance ? " [glance]" : "";
      return `Closed ${e.view || "view"}${dur}${gl}`;
    }
    case "template_selected":
      return `Selected template: ${e.template || "?"}`;
    case "suggestion_click":
      return `Clicked suggestion: "${e.suggestion || "?"}"`;
    case "suggestion_scroll_click":
      return `Browsed ${e.section || "suggestions"}`;
    case "tab_switch":
      return `Switched to ${e.tab || "tab"}`;
    case "panel_order_assigned":
      return `A/B variant: ${e.variant || "?"}`;
    default:
      return e.event?.replace(/_/g, " ") || "unknown";
  }
}

interface SessionGroup {
  id: string;
  events: UserEvent[];
}

function groupSessions(events: UserEvent[]): SessionGroup[] {
  const map: Record<string, UserEvent[]> = {};
  for (const e of events) {
    const sid = e.sessionId || "unknown";
    if (!map[sid]) map[sid] = [];
    map[sid].push(e);
  }
  return Object.entries(map)
    .map(([id, evts]) => ({ id, events: evts }))
    .sort(
      (a, b) =>
        new Date(a.events[0].createdAt).getTime() -
        new Date(b.events[0].createdAt).getTime(),
    );
}

function UserCard({ user }: { user: UserJourney }) {
  const [open, setOpen] = useState(false);
  const sessions = useMemo(() => groupSessions(user.events), [user.events]);

  const counts = useMemo(() => {
    const c = { prompt: 0, gen: 0, view: 0, click: 0, dl: 0, err: 0 };
    for (const e of user.events) {
      const cls = dotClass(e);
      if (cls === "uj-dot-prompt") c.prompt++;
      else if (cls === "uj-dot-gen") c.gen++;
      else if (cls === "uj-dot-view") c.view++;
      else if (cls === "uj-dot-click") c.click++;
      else if (cls === "uj-dot-dl") c.dl++;
      else if (cls === "uj-dot-err") c.err++;
    }
    return c;
  }, [user.events]);

  const total = user.events.length;
  const successRate =
    user.totalGenerations > 0
      ? Math.round((user.successfulGenerations / user.totalGenerations) * 100)
      : 0;

  return (
    <div className="uj-card">
      <div className="uj-card-header" onClick={() => setOpen(!open)}>
        <div className="uj-card-left">
          <span className="uj-name">
            {user.displayName || user.email.split("@")[0]}
          </span>
          <span className="uj-email">{user.email}</span>
          <div className="uj-bar">
            <div
              style={{
                width: `${(counts.prompt / total) * 100}%`,
                background: "#6c3fa0",
              }}
            />
            <div
              style={{
                width: `${(counts.gen / total) * 100}%`,
                background: "#3fa06c",
              }}
            />
            <div
              style={{
                width: `${(counts.view / total) * 100}%`,
                background: "#3f6ca0",
              }}
            />
            <div
              style={{
                width: `${(counts.click / total) * 100}%`,
                background: "#a03f6c",
              }}
            />
            <div
              style={{
                width: `${(counts.dl / total) * 100}%`,
                background: "#e6a030",
              }}
            />
            <div
              style={{
                width: `${(counts.err / total) * 100}%`,
                background: "#d44",
              }}
            />
          </div>
        </div>
        <div className="uj-card-right">
          <div className="uj-stats">
            <span>
              <b>{user.events.length}</b> events
            </span>
            <span>
              <b>{user.prompts.length}</b> prompts
            </span>
            <span>
              <b>{user.pluginCount}</b> plugins
            </span>
            <span>
              <b>{sessions.length}</b> sessions
            </span>
            <span>
              <b>{successRate}%</b> success
            </span>
          </div>
          <span className={`uj-arrow ${open ? "uj-arrow-open" : ""}`}>
            &#9654;
          </span>
        </div>
      </div>

      {open && (
        <div className="uj-timeline">
          {sessions.map((s) => (
            <div key={s.id} className="uj-session">
              <div className="uj-session-header">
                <span>
                  Session &mdash; {formatDate(s.events[0].createdAt)}{" "}
                  {formatTime(s.events[0].createdAt)}
                </span>
                <span>
                  {s.events.length} events &middot; {sessionDuration(s.events)}
                </span>
              </div>
              {s.events.map((e, i) => (
                <div key={i} className="uj-event">
                  <span className="uj-time">{formatTime(e.createdAt)}</span>
                  <div className={`uj-dot ${dotClass(e)}`} />
                  <span className="uj-label">
                    {describeEvent(e, user.prompts)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UserJourneys() {
  const [journeys, setJourneys] = useState<UserJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    fetchUserJourneys()
      .then(setJourneys)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { all: journeys.length, power: 0, regular: 0, browser: 0 };
    for (const u of journeys) c[classify(u)]++;
    return c;
  }, [journeys]);

  const filtered = useMemo(
    () =>
      journeys
        .filter((u) => filter === "all" || classify(u) === filter)
        .sort(
          (a, b) =>
            b.events.length +
            b.prompts.length -
            (a.events.length + a.prompts.length),
        ),
    [journeys, filter],
  );

  if (loading) return <div className="uj-loading">Loading user journeys...</div>;
  if (error) return <div className="uj-error">Error: {error}</div>;

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "All Users" },
    { key: "power", label: "Power (5+ prompts)" },
    { key: "regular", label: "Regular (2-4)" },
    { key: "browser", label: "Browsers (0-1)" },
  ];

  return (
    <div className="uj-container">
      <div className="uj-legend">
        <div className="uj-legend-item">
          <div className="uj-dot uj-dot-prompt" /> Prompt
        </div>
        <div className="uj-legend-item">
          <div className="uj-dot uj-dot-gen" /> Generation
        </div>
        <div className="uj-legend-item">
          <div className="uj-dot uj-dot-view" /> View
        </div>
        <div className="uj-legend-item">
          <div className="uj-dot uj-dot-dl" /> Download
        </div>
        <div className="uj-legend-item">
          <div className="uj-dot uj-dot-click" /> Click
        </div>
        <div className="uj-legend-item">
          <div className="uj-dot uj-dot-err" /> Error
        </div>
      </div>

      <div className="uj-filters">
        {filters.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? "uj-filter-active" : ""}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {filtered.map((u) => (
        <UserCard key={u.uid} user={u} />
      ))}
    </div>
  );
}
