// Frame-rate analyzer — turns "feels laggy" into a number.
//
// Mechanism:
//   1. addInitScript injects a requestAnimationFrame loop into every page;
//      each frame pushes performance.now() onto window.__frameLog.
//   2. On stop, harness extracts __frameLog and computes:
//        - p50/p95/p99 frame interval (ms)
//        - jank count (frames > 50ms = below ~20 FPS)
//        - longest stall (ms)
//        - For VNC views: canvas pixel hash sampled every 250ms;
//          consecutive identical hashes >1s = freeze window.
//   3. Returns a structured lag-report object.
//
// Why: vnc-viewer.tsx:456-484 has the FPS estimator embedded in the
// component, but it never reports anywhere. This instrument runs the
// SAME loop from the harness side so we can compare numbers across runs.

const INIT_SCRIPT = `
(function() {
  if (window.__frameLog) return;
  window.__frameLog = [];
  window.__hashLog = [];
  let last = performance.now();
  function tick() {
    const now = performance.now();
    window.__frameLog.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Canvas pixel hash sampler — only meaningful when a <canvas> exists.
  // Used to detect VNC freezes (canvas stops repainting).
  function hashCanvas() {
    try {
      const c = document.querySelector("canvas");
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      // Sample a 32x32 region from the center to keep hash cost bounded.
      const w = Math.min(32, c.width || 0), h = Math.min(32, c.height || 0);
      if (!w || !h) return;
      const cx = Math.max(0, Math.floor((c.width - w) / 2));
      const cy = Math.max(0, Math.floor((c.height - h) / 2));
      const data = ctx.getImageData(cx, cy, w, h).data;
      // Cheap hash — sum every 16th byte.
      let hash = 0;
      for (let i = 0; i < data.length; i += 16) hash = ((hash << 5) - hash + data[i]) | 0;
      window.__hashLog.push({ t: performance.now(), h: hash });
    } catch (_) {}
  }
  setInterval(hashCanvas, 250);
})();
`;

export function frameRateAnalyzer({ ev, page, ctx }) {
  return {
    async start() {
      // addInitScript via context so it runs on every page load (handles SPA navigation)
      if (ctx?.addInitScript) {
        await ctx.addInitScript({ content: INIT_SCRIPT });
      } else {
        await page.addInitScript({ content: INIT_SCRIPT });
      }
      // Also inject on the current page in case it's already loaded.
      await page.evaluate(INIT_SCRIPT).catch(() => {});
    },
    async stop() {
      const result = await page.evaluate(() => ({
        frames: window.__frameLog || [],
        hashes: window.__hashLog || [],
      })).catch(() => ({ frames: [], hashes: [] }));

      const intervals = result.frames.filter((f) => f > 0 && f < 5000); // discard outliers
      intervals.sort((a, b) => a - b);
      const pct = (p) => intervals.length ? intervals[Math.floor(intervals.length * p)] : 0;

      const median = pct(0.5);
      const p95 = pct(0.95);
      const p99 = pct(0.99);
      const jank = intervals.filter((x) => x > 50).length;
      const longestStall = intervals.length ? intervals[intervals.length - 1] : 0;

      // Freeze detection: walk hashes, find runs of identical hash >1s
      const freezes = [];
      let runStart = null, runHash = null;
      for (const h of result.hashes) {
        if (runHash === h.h) {
          // continue run
        } else {
          if (runStart && runHash !== null) {
            const dur = (result.hashes[result.hashes.indexOf(h) - 1]?.t ?? h.t) - runStart;
            if (dur > 1000) freezes.push({ start: runStart, ms: dur });
          }
          runStart = h.t;
          runHash = h.h;
        }
      }
      const totalFreezeMs = freezes.reduce((s, f) => s + f.ms, 0);

      const report = {
        sample_count: intervals.length,
        median_frame_interval_ms: Number(median.toFixed(2)),
        p95_frame_interval_ms: Number(p95.toFixed(2)),
        p99_frame_interval_ms: Number(p99.toFixed(2)),
        jank_count: jank,
        longest_stall_ms: Number(longestStall.toFixed(2)),
        freeze_windows: freezes.length,
        total_freeze_ms: Number(totalFreezeMs.toFixed(2)),
      };
      ev("lag.report", report);
      return report;
    },
  };
}
