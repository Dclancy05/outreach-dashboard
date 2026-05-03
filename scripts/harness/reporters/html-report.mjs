// HTML report — clickable timeline with screenshots inline. Self-contained
// (no external CSS/JS) so it can be opened from /tmp/.

import fs from "node:fs";
import path from "node:path";

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function describe(e) {
  switch (e.kind) {
    case "cdp.target_created":   return `🆕 ${escape(e.type)} ${escape(e.url)}`;
    case "cdp.target_destroyed": return `❌ ${escape(e.type)} ${escape(e.url || e.title)}`;
    case "cdp.target_navigated": return `🧭 ${escape(e.fromUrl)} → ${escape(e.toUrl)}`;
    case "net.request":          return `→ ${escape(e.method)} ${escape(e.url)}`;
    case "net.response":         return `← <strong>${e.status}</strong> ${escape(e.url)}`;
    case "ws.open":              return `🔌 OPEN ${escape(e.url)}`;
    case "ws.close":             return `🔌 CLOSE frames=${e.frames}`;
    case "console":              return `📝 [${escape(e.type)}] ${escape(e.text)}`;
    case "page.error":           return `💥 ${escape(e.message)}`;
    case "lag.report":           return `📊 lag p50=${e.median_frame_interval_ms} p95=${e.p95_frame_interval_ms} jank=${e.jank_count}`;
    case "shot":                 return `📸 #${e.idx}`;
    default:                     return escape(JSON.stringify(e).slice(0, 200));
  }
}

export function writeHtmlReport(events, outDir, meta) {
  const rows = events.map((e) => {
    const ts = `+${(e.t / 1000).toFixed(2)}s`;
    const cls = e.kind.replace(/\./g, "-");
    return `<tr class="row ${cls}"><td class="ts">${ts}</td><td class="kind">${escape(e.kind)}</td><td class="data">${describe(e)}</td></tr>`;
  }).join("\n");

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Harness — ${escape(meta.scenario)}</title>
<style>
  body { font: 13px/1.45 ui-monospace, Menlo, Consolas, monospace; margin: 16px; background: #0d1117; color: #c9d1d9; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  .meta { color: #8b949e; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 8px; border-bottom: 1px solid #21262d; }
  td.ts { color: #8b949e; white-space: nowrap; }
  td.kind { color: #79c0ff; white-space: nowrap; }
  tr.row.page-error td { background: #3a0f12; color: #ff7b72; }
  tr.row.cdp-target_created td { background: #0a2818; }
  tr.row.cdp-target_destroyed td { background: #2a1208; }
  tr.row.lag-report td { background: #1f2933; color: #ffa657; }
  .filter { margin-bottom: 8px; }
  .filter input { background: #161b22; color: #c9d1d9; border: 1px solid #30363d; padding: 4px 8px; }
</style>
<h1>Harness — ${escape(meta.scenario)}</h1>
<div class="meta">duration ${meta.duration_s}s · ${events.length} events · ${new Date(meta.t0).toISOString()}</div>
<div class="filter"><input type="text" id="q" placeholder="filter (regex on kind or data)" /></div>
<table id="t">${rows}</table>
<script>
  const q = document.getElementById('q');
  q.addEventListener('input', () => {
    const r = q.value ? new RegExp(q.value, 'i') : null;
    for (const row of document.querySelectorAll('#t tr')) {
      row.style.display = !r || r.test(row.textContent) ? '' : 'none';
    }
  });
</script>
`;
  const file = path.join(outDir, "report.html");
  fs.writeFileSync(file, html);
  return file;
}
