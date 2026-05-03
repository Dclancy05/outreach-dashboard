// Structured JSON output for AI ingestion.
//
// Shape (intentionally flat, easy to grep/parse):
//   {
//     scenario: string,
//     duration_s: number,
//     started_at: ISO,
//     summary: { ... numeric counts ... },
//     lag: { ... lag-report ... },
//     visual: { ... visual-diff ... },
//     audit: { ... chrome-goto scrape ... },
//     events_total: number,
//     events_by_kind: { [kind]: count },
//     errors: [...],
//     network_requests_by_endpoint: { [endpoint]: count },
//     timeline_excerpt: [first 200 events excluding shots]
//   }

import fs from "node:fs";
import path from "node:path";

function bucketEndpoint(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/[0-9a-f-]{12,}/g, "/:id").replace(/\?.*$/, "");
  } catch {
    return url.slice(0, 80);
  }
}

export function writeClaudeReadable(events, outDir, meta) {
  const byKind = {};
  for (const e of events) byKind[e.kind] = (byKind[e.kind] || 0) + 1;

  const requests = events.filter((e) => e.kind === "net.request");
  const byEndpoint = {};
  for (const r of requests) {
    const k = bucketEndpoint(r.url);
    byEndpoint[k] = (byEndpoint[k] || 0) + 1;
  }

  const errors = events.filter((e) => e.kind === "page.error" || (e.kind === "console" && /error/i.test(e.type)));
  const lag = events.find((e) => e.kind === "lag.report");
  const visual = events.find((e) => e.kind === "visual_diff.report");
  const audit = events.find((e) => e.kind === "audit.scrape");

  const goto = events.filter((e) => e.kind === "net.request" && /\/goto(\?|$)/.test(e.url));
  const loginStatus = events.filter((e) => e.kind === "net.request" && /\/login-status/.test(e.url));
  const responses5xx = events.filter((e) => e.kind === "net.response" && e.status >= 500);
  const responses429 = events.filter((e) => e.kind === "net.response" && e.status === 429);
  const tabsCreated = events.filter((e) => e.kind === "cdp.target_created").length;
  const tabsDestroyed = events.filter((e) => e.kind === "cdp.target_destroyed").length;
  const wsOpen = events.filter((e) => e.kind === "ws.open").length;
  const wsClose = events.filter((e) => e.kind === "ws.close").length;

  const out = {
    scenario: meta.scenario,
    duration_s: meta.duration_s,
    started_at: new Date(meta.t0).toISOString(),
    finished_at: new Date(meta.t0 + meta.duration_s * 1000).toISOString(),
    summary: {
      events_total: events.length,
      tabs_created: tabsCreated,
      tabs_destroyed: tabsDestroyed,
      goto_calls: goto.length,
      login_status_calls: loginStatus.length,
      responses_5xx: responses5xx.length,
      responses_429: responses429.length,
      ws_open: wsOpen,
      ws_close: wsClose,
      errors: errors.length,
    },
    lag: lag ? { ...lag, t: undefined, kind: undefined } : null,
    visual: visual ? { ...visual, t: undefined, kind: undefined } : null,
    audit: audit ? { ...audit, t: undefined, kind: undefined } : null,
    events_by_kind: byKind,
    network_requests_by_endpoint: byEndpoint,
    errors: errors.slice(0, 30),
    timeline_excerpt: events.filter((e) => e.kind !== "shot").slice(0, 200),
  };
  const file = path.join(outDir, "claude-readable.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  return { file, summary: out };
}
