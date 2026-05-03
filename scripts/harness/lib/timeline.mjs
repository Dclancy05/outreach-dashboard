// Shared timeline used by run.mjs + every instrument + every scenario.
// One global event log per run — instruments push, reporters read.

export function createTimeline() {
  const events = [];
  const t0 = Date.now();

  return {
    /** seconds since run start as "+12.34s" */
    sec: () => ((Date.now() - t0) / 1000).toFixed(2),
    /** ms since run start (raw number) */
    ms: () => Date.now() - t0,
    /** push an event onto the timeline */
    ev: (kind, data = {}) => {
      events.push({ t: Date.now() - t0, kind, ...data });
    },
    /** stdout log with elapsed prefix */
    log: (m) => console.log(`+${((Date.now() - t0) / 1000).toFixed(2)}s ${m}`),
    /** read-only snapshot for reporters */
    snapshot: () => events.slice(),
    t0,
  };
}
