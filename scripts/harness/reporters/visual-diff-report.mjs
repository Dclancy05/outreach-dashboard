// Visual diff reporter — pairs labels/<id>-before.png with labels/<id>-after.png,
// generates outDir/visual-diff.html with side-by-side BEFORE | DIFF | AFTER columns.
//
// pixelmatch + pngjs are dev-deps. If they're missing we still emit the HTML
// without a diff column (just plain side-by-side) so the report is always
// usable even on a stripped-down install.

import fs from "node:fs";
import path from "node:path";

let pixelmatch = null;
let PNG = null;
try {
  pixelmatch = (await import("pixelmatch")).default;
  PNG = (await import("pngjs")).PNG;
} catch {
  // optional — fall back to no-diff mode
}

function pairUp(labels) {
  const byId = new Map();
  for (const l of labels) {
    if (!byId.has(l.id)) byId.set(l.id, {});
    byId.get(l.id)[l.label] = l;
  }
  // Stable order by id
  return Array.from(byId.entries())
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([id, parts]) => ({ id, before: parts.before, after: parts.after }));
}

function diffPng(beforePath, afterPath, outPath) {
  if (!pixelmatch || !PNG) return null;
  try {
    const before = PNG.sync.read(fs.readFileSync(beforePath));
    const after = PNG.sync.read(fs.readFileSync(afterPath));
    if (before.width !== after.width || before.height !== after.height) {
      // Pad smaller image to match — quick & dirty
      const w = Math.max(before.width, after.width);
      const h = Math.max(before.height, after.height);
      const pad = (img) => {
        if (img.width === w && img.height === h) return img;
        const out = new PNG({ width: w, height: h });
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const sIdx = (img.width * y + x) << 2;
            const dIdx = (w * y + x) << 2;
            out.data[dIdx] = img.data[sIdx];
            out.data[dIdx + 1] = img.data[sIdx + 1];
            out.data[dIdx + 2] = img.data[sIdx + 2];
            out.data[dIdx + 3] = img.data[sIdx + 3];
          }
        }
        return out;
      };
      const b = pad(before);
      const a = pad(after);
      const diff = new PNG({ width: w, height: h });
      const changed = pixelmatch(b.data, a.data, diff.data, w, h, { threshold: 0.1, alpha: 0.6 });
      fs.writeFileSync(outPath, PNG.sync.write(diff));
      return { changed, total: w * h };
    }
    const { width, height } = before;
    const diff = new PNG({ width, height });
    const changed = pixelmatch(before.data, after.data, diff.data, width, height, { threshold: 0.1, alpha: 0.6 });
    fs.writeFileSync(outPath, PNG.sync.write(diff));
    return { changed, total: width * height };
  } catch (e) {
    return null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export function writeVisualDiffReport(labels, outDir, meta = {}) {
  const pairs = pairUp(labels);
  const diffDir = path.join(outDir, "diffs");
  fs.mkdirSync(diffDir, { recursive: true });

  const rows = pairs.map((p) => {
    const beforeRel = p.before ? path.relative(outDir, p.before.file) : null;
    const afterRel = p.after ? path.relative(outDir, p.after.file) : null;
    let diffRel = null;
    let changeStats = null;
    if (p.before && p.after) {
      const diffPath = path.join(diffDir, `${String(p.id).replace(/[^\w.-]+/g, "_")}.png`);
      changeStats = diffPng(p.before.file, p.after.file, diffPath);
      if (changeStats) diffRel = path.relative(outDir, diffPath);
    }
    const changedPct = changeStats
      ? ((changeStats.changed / changeStats.total) * 100).toFixed(2)
      : null;
    return { id: p.id, beforeRel, afterRel, diffRel, changedPct };
  });

  const totalPairs = rows.length;
  const completePairs = rows.filter((r) => r.beforeRel && r.afterRel).length;

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Visual diff — ${escapeHtml(meta.scenario || "scenario")}</title>
<style>
  body { font-family: ui-sans-serif, -apple-system, system-ui, sans-serif; background: #0b0d10; color: #d6d8db; margin: 0; padding: 0 24px 48px; }
  h1 { font-size: 22px; margin: 24px 0 4px; }
  .meta { color: #8b8e93; font-size: 13px; margin-bottom: 24px; }
  .row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 32px; }
  .row .pane { background: #15181d; border: 1px solid #232830; border-radius: 8px; overflow: hidden; }
  .row .pane h3 { font-size: 12px; padding: 10px 14px; margin: 0; border-bottom: 1px solid #232830; background: #1b1f25; color: #b1b3b8; text-transform: uppercase; letter-spacing: 0.06em; }
  .row .pane h3 .pct { color: #f3a712; float: right; font-weight: 600; letter-spacing: 0; }
  .row .pane h3 .pct.zero { color: #4ade80; }
  .row img { width: 100%; display: block; cursor: zoom-in; background: #000; }
  .row .id { grid-column: 1 / -1; font-size: 14px; color: #d6d8db; margin: 8px 0 4px; font-weight: 600; }
  .empty { color: #8b8e93; font-size: 13px; padding: 20px; text-align: center; }
  .summary { background: #1b1f25; border: 1px solid #232830; border-radius: 8px; padding: 14px 18px; margin-bottom: 28px; }
  .summary strong { color: #fff; }
  .summary .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; margin-left: 6px; }
  .pill.ok { background: #14532d; color: #86efac; }
  .pill.warn { background: #5d3505; color: #fcd34d; }
</style>
</head><body>
<h1>Visual diff — ${escapeHtml(meta.scenario || "scenario")}</h1>
<div class="meta">${totalPairs} labeled pair(s), ${completePairs} complete · ${pixelmatch ? "pixelmatch" : "fallback (no diff)"}</div>
${rows.length === 0 ? `<div class="empty">No labeled snapshots in this run. Emit <code>ev("snapshot.label", { id, label })</code> to populate.</div>` : ""}
${rows.map((r) => `
  <div class="id">${escapeHtml(r.id)}${r.changedPct !== null ? ` · changed: <span class="pill ${parseFloat(r.changedPct) > 0.1 ? "warn" : "ok"}">${r.changedPct}%</span>` : ""}</div>
  <div class="row">
    <div class="pane">
      <h3>BEFORE</h3>
      ${r.beforeRel ? `<a href="${escapeHtml(r.beforeRel)}" target="_blank"><img src="${escapeHtml(r.beforeRel)}"></a>` : `<div class="empty">missing</div>`}
    </div>
    <div class="pane">
      <h3>DIFF ${r.changedPct !== null ? `<span class="pct ${parseFloat(r.changedPct) > 0 ? "" : "zero"}">${r.changedPct}%</span>` : ""}</h3>
      ${r.diffRel ? `<a href="${escapeHtml(r.diffRel)}" target="_blank"><img src="${escapeHtml(r.diffRel)}"></a>` : `<div class="empty">${pixelmatch ? "missing pair" : "pixelmatch unavailable"}</div>`}
    </div>
    <div class="pane">
      <h3>AFTER</h3>
      ${r.afterRel ? `<a href="${escapeHtml(r.afterRel)}" target="_blank"><img src="${escapeHtml(r.afterRel)}"></a>` : `<div class="empty">missing</div>`}
    </div>
  </div>
`).join("")}
</body></html>`;

  const file = path.join(outDir, "visual-diff.html");
  fs.writeFileSync(file, html);
  return { file, rows, totalPairs, completePairs };
}
