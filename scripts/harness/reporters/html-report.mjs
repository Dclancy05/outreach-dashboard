// Self-contained harness report. One HTML file, all asset paths relative to
// outDir, opens locally with a double-click or via `npx serve`.
//
// Sections: pass/fail header → embedded video → assertion table with thumbs
// → visual diff strip → DB assertions → network timeline → console errors
// → raw event log.

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
    case "snapshot.label.saved": return `🏷  ${escape(e.id)} / ${escape(e.label)}`;
    default:                     return escape(JSON.stringify(e).slice(0, 200));
  }
}

function findVideo(outDir) {
  const dir = path.join(outDir, "video");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".webm"));
  if (!files.length) return null;
  return path.relative(outDir, path.join(dir, files[0]));
}

function visualDiffSection(visualDiff, outDir) {
  if (!visualDiff || !visualDiff.rows?.length) {
    return `<p class="muted">No labeled snapshots in this run.</p>`;
  }
  return visualDiff.rows.map((r) => `
    <div class="vd-row">
      <div class="vd-label">${escape(r.id)}${r.changedPct !== null ? ` <span class="pill ${parseFloat(r.changedPct) > 0.5 ? "warn" : "ok"}">${r.changedPct}% changed</span>` : ""}</div>
      <div class="vd-grid">
        <div class="vd-cell">
          <div class="vd-cap">BEFORE</div>
          ${r.beforeRel ? `<a href="${escape(r.beforeRel)}" target="_blank"><img src="${escape(r.beforeRel)}"></a>` : `<div class="empty">missing</div>`}
        </div>
        <div class="vd-cell">
          <div class="vd-cap">DIFF</div>
          ${r.diffRel ? `<a href="${escape(r.diffRel)}" target="_blank"><img src="${escape(r.diffRel)}"></a>` : `<div class="empty">—</div>`}
        </div>
        <div class="vd-cell">
          <div class="vd-cap">AFTER</div>
          ${r.afterRel ? `<a href="${escape(r.afterRel)}" target="_blank"><img src="${escape(r.afterRel)}"></a>` : `<div class="empty">missing</div>`}
        </div>
      </div>
    </div>
  `).join("");
}

function dbAssertionsSection(dbAssertions) {
  if (!dbAssertions?.length) return `<p class="muted">No DB assertions in this scenario.</p>`;
  const rows = dbAssertions.map((a) => `
    <tr class="${a.ok ? "ok" : "fail"}">
      <td>${a.ok ? "✅" : "❌"}</td>
      <td><code>${escape(a.platform || "?")}</code></td>
      <td><code>${escape(a.username || "?")}</code></td>
      <td><code>${escape(a.account_id || "?")}</code></td>
      <td>${escape(a.detail || "")}</td>
    </tr>
  `).join("");
  return `<table class="db-table">
    <thead><tr><th></th><th>platform</th><th>username</th><th>account_id</th><th>detail</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function assertionsHeader(assertions, summary) {
  if (!assertions?.length) return "";
  const passed = assertions.filter((a) => a.ok).length;
  const total = assertions.length;
  const overall = passed === total;
  const rows = assertions.map((a) => `
    <tr class="${a.ok ? "ok" : "fail"}">
      <td>${a.ok ? "✅" : "❌"}</td>
      <td><code>${escape(a.name)}</code></td>
      <td>${escape(a.detail || "")}</td>
    </tr>
  `).join("");
  return `<section>
    <h2>Assertions <span class="pill ${overall ? "ok" : "fail"}">${passed}/${total}</span></h2>
    <table class="assert-table">
      <thead><tr><th></th><th>name</th><th>detail</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

export function writeHtmlReport(events, outDir, meta) {
  const videoRel = findVideo(outDir);
  const rows = events.map((e) => {
    const ts = `+${(e.t / 1000).toFixed(2)}s`;
    const cls = e.kind.replace(/\./g, "-");
    return `<tr class="row ${cls}"><td class="ts">${ts}</td><td class="kind">${escape(e.kind)}</td><td class="data">${describe(e)}</td></tr>`;
  }).join("\n");

  const netEvents = events.filter((e) =>
    e.kind === "net.request" || e.kind === "net.response"
  ).map((e) => {
    const ts = `+${(e.t / 1000).toFixed(2)}s`;
    return `<tr class="row ${e.kind.replace(/\./g, "-")} ${(e.status || 0) >= 400 ? "err" : ""}">
      <td class="ts">${ts}</td>
      <td class="kind">${escape(e.kind)}</td>
      <td class="data">${describe(e)}</td>
    </tr>`;
  }).join("");

  const consoleErrors = events.filter((e) => e.kind === "page.error" || (e.kind === "console" && e.type === "error"))
    .map((e) => `<li><code>${describe(e)}</code></li>`).join("");

  const summary = meta.summary || {};
  const stamp = new Date(meta.t0 || Date.now()).toISOString();

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Harness — ${escape(meta.scenario)}</title>
<style>
  :root { color-scheme: dark; }
  body { font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; margin: 0; background: #0b0d10; color: #e6e8eb; padding: 24px 32px 64px; }
  h1 { font-size: 24px; margin: 0 0 6px; font-weight: 700; }
  h2 { font-size: 17px; margin: 28px 0 10px; color: #d6d8db; border-bottom: 1px solid #232830; padding-bottom: 4px; }
  .meta { color: #8b8e93; font-size: 13px; margin-bottom: 16px; }
  .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .pill.ok { background: #14532d; color: #86efac; }
  .pill.fail { background: #5d1010; color: #fca5a5; }
  .pill.warn { background: #5d3505; color: #fcd34d; }
  section { margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #8b8e93; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #232830; }
  td { padding: 6px 8px; border-bottom: 1px solid #1a1d22; vertical-align: top; }
  tr.ok td:first-child { color: #4ade80; }
  tr.fail td { background: #25090f; }
  tr.fail td:first-child { color: #f87171; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #fcd34d; }
  video { width: 100%; max-width: 1200px; border-radius: 8px; background: #000; border: 1px solid #232830; }
  .vd-row { margin-bottom: 24px; }
  .vd-label { font-weight: 600; margin-bottom: 6px; color: #d6d8db; }
  .vd-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .vd-cell { background: #15181d; border: 1px solid #232830; border-radius: 6px; overflow: hidden; }
  .vd-cap { font-size: 11px; padding: 8px 12px; color: #8b8e93; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #232830; background: #1b1f25; }
  .vd-cell img { width: 100%; display: block; cursor: zoom-in; background: #000; }
  .empty { padding: 18px; text-align: center; color: #8b8e93; }
  .muted { color: #8b8e93; font-size: 13px; }
  .filter { margin: 8px 0; }
  .filter input { background: #15181d; color: #e6e8eb; border: 1px solid #232830; padding: 6px 10px; border-radius: 4px; min-width: 280px; }
  details { margin: 4px 0; }
  details summary { cursor: pointer; padding: 4px 0; color: #79c0ff; }
  /* timeline rows */
  table.timeline tr.row.page-error td { background: #3a0f12; color: #ff7b72; }
  table.timeline tr.row.cdp-target_created td { background: #0a2818; }
  table.timeline tr.row.cdp-target_destroyed td { background: #2a1208; }
  table.timeline tr.row.lag-report td { background: #1f2933; color: #ffa657; }
  td.ts { color: #8b8e93; white-space: nowrap; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  td.kind { color: #79c0ff; white-space: nowrap; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
</style>
</head><body>

<h1>Harness — ${escape(meta.scenario)}</h1>
<div class="meta">${meta.duration_s}s · ${events.length} events · ${escape(stamp)} ${meta.gitSha ? "· <code>" + escape(meta.gitSha.slice(0, 8)) + "</code>" : ""}</div>

${assertionsHeader(meta.assertions || [], summary)}

${videoRel ? `<section><h2>Video</h2><video controls src="${escape(videoRel)}"></video></section>` : ""}

<section>
  <h2>Visual diff <span class="pill ${meta.visualDiff?.completePairs === meta.visualDiff?.totalPairs ? "ok" : "warn"}">${meta.visualDiff?.completePairs || 0}/${meta.visualDiff?.totalPairs || 0} pairs</span></h2>
  ${visualDiffSection(meta.visualDiff, outDir)}
</section>

<section>
  <h2>DB assertions</h2>
  ${dbAssertionsSection(meta.dbAssertions || [])}
</section>

<section>
  <h2>Network <span class="pill warn">${events.filter((e) => e.kind === "net.response").length} responses</span></h2>
  <details><summary>Show timeline</summary>
    <table class="timeline">${netEvents}</table>
  </details>
</section>

${consoleErrors ? `<section><h2>Console errors</h2><ul>${consoleErrors}</ul></section>` : ""}

<section>
  <h2>Full event timeline <span class="muted">${events.length}</span></h2>
  <div class="filter"><input type="text" id="q" placeholder="filter (regex on any column)" /></div>
  <details><summary>Expand</summary>
    <table id="t" class="timeline">${rows}</table>
  </details>
</section>

<script>
  const q = document.getElementById('q');
  if (q) q.addEventListener('input', () => {
    const r = q.value ? new RegExp(q.value, 'i') : null;
    for (const row of document.querySelectorAll('#t tr')) {
      row.style.display = !r || r.test(row.textContent) ? '' : 'none';
    }
  });
</script>
</body></html>`;
  const file = path.join(outDir, "report.html");
  fs.writeFileSync(file, html);
  return file;
}
