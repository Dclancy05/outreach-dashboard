// Two screenshot modes:
// 1. Continuous stream — every intervalMs (default 500). Saved to outDir/screenshots/.
//    Used by frame-rate-analyzer / visual-diff for jank/freeze detection.
// 2. Labeled snapshots — saved on demand when a scenario emits an event of
//    kind="snapshot.label" with { id, label }. Saved to outDir/labels/<id>-<label>.png.
//    Full-page by default for richer reports.
//
// Scenarios trigger a labeled snapshot via:
//   ev("snapshot.label", { id: "p0-instagram", label: "before" })
// followed by `await waitForLabel({ id, label })` if they need to be sure the
// PNG hit disk before continuing. The instrument exposes that helper too.

import fs from "node:fs";
import path from "node:path";

export function screenshotStream({ ev, page, outDir, intervalMs = 500, timeline }) {
  const streamDir = path.join(outDir, "screenshots");
  const labelDir = path.join(outDir, "labels");
  fs.mkdirSync(streamDir, { recursive: true });
  fs.mkdirSync(labelDir, { recursive: true });

  let idx = 0;
  let interval = null;
  const labels = []; // { id, label, file, t }

  // Subscribe to the timeline so we can react to scenario-emitted events.
  // The timeline lib exposes `subscribe` if it's the new API; fall back to
  // polling the events array if not. We accept a `timeline` arg for direct
  // hookup; if missing, we just don't do labeled mode.
  let unsubscribe = null;

  return {
    start() {
      interval = setInterval(async () => {
        idx++;
        const file = path.join(streamDir, `${String(idx).padStart(4, "0")}.png`);
        await page.screenshot({ path: file }).catch(() => {});
        ev("shot", { idx, file });
      }, intervalMs);

      // Hook the timeline's onEvent if available.
      if (timeline && typeof timeline.onEvent === "function") {
        unsubscribe = timeline.onEvent(async (evt) => {
          if (evt.kind !== "snapshot.label") return;
          const { id = "anon", label = "frame" } = evt.payload || {};
          const safe = (s) => String(s).replace(/[^\w.-]+/g, "_");
          const file = path.join(labelDir, `${safe(id)}-${safe(label)}.png`);
          try {
            await page.screenshot({ path: file, fullPage: true });
            labels.push({ id, label, file, t: Date.now() });
            ev("snapshot.label.saved", { id, label, file });
          } catch (e) {
            ev("snapshot.label.error", { id, label, error: e.message });
          }
        });
      }
    },
    stop() {
      if (interval) clearInterval(interval);
      interval = null;
      if (unsubscribe) unsubscribe();
    },
    count: () => idx,
    labels: () => labels,
  };
}
