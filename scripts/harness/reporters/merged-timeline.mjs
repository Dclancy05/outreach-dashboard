// Plain-text merged timeline — chronological, one line per event.
// Same format the original popup-deep-diagnostic produced; we keep it
// because it's already proven readable for human debugging.

import fs from "node:fs";
import path from "node:path";

function summarize(e) {
  switch (e.kind) {
    case "cdp.snapshot":         return `CDP initial: ${e.count} targets`;
    case "cdp.target_created":   return `🆕 NEW TAB ${e.type} ${e.url}`;
    case "cdp.target_destroyed": return `❌ TAB CLOSED ${e.type} ${e.url || e.title}`;
    case "cdp.target_navigated": return `🧭 NAVIGATED ${e.type} ${e.fromUrl} → ${e.toUrl}`;
    case "net.request":          return `→ ${e.method} ${e.url}${e.body ? ` ${JSON.stringify(e.body).slice(0, 80)}` : ""}`;
    case "net.response":         return `← ${e.status} ${e.url}`;
    case "ws.open":              return `🔌 WS OPEN ${e.url}`;
    case "ws.close":             return `🔌 WS CLOSE ${e.url} frames=${e.frames} bytes=${e.bytes}`;
    case "console":              return `📝 [${e.type}] ${e.text}`;
    case "page.error":           return `💥 PAGE ERROR ${e.message}`;
    case "shot":                 return null; // skip — too noisy in text view
    case "lag.report":           return `📊 LAG p50=${e.median_frame_interval_ms}ms p95=${e.p95_frame_interval_ms}ms jank=${e.jank_count} freezes=${e.freeze_windows}`;
    case "visual_diff.report":   return `🎞 VISUAL frames=${e.frames} stutters=${e.stutter_count}`;
    case "audit.scrape":         return `🔍 AUDIT count=${e.count} platforms=${JSON.stringify(e.by_platform)}`;
    case "flow.navigate_start":  return `🚀 navigate ${e.url}`;
    case "flow.pin_start":       return `🔐 pin start`;
    case "flow.pin_done":        return `🔐 pin done @ ${e.url}`;
    case "flow.click_sign_in":   return `👆 click Sign In Now (platform=${e.platform})`;
    case "flow.click_im_logged_in_start": return `👆 click I'm Logged In`;
    case "flow.end":             return `🏁 flow end`;
    default:                     return `${e.kind} ${JSON.stringify(e).slice(0, 200)}`;
  }
}

export function writeMergedTimeline(events, outDir) {
  const lines = events.map((e) => {
    const s = summarize(e);
    if (s === null) return null;
    const ts = `+${(e.t / 1000).toFixed(2).padStart(7)}s`;
    return `${ts} ${e.kind.padEnd(24)} ${s}`;
  }).filter(Boolean);
  const file = path.join(outDir, "timeline.txt");
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}
