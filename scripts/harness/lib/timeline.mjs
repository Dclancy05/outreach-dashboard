// Shared timeline used by run.mjs + every instrument + every scenario.
// One global event log per run — instruments push, reporters read.

export function createTimeline() {
  const events = [];
  const subscribers = new Set();
  const t0 = Date.now();

  function ev(kind, data = {}) {
    const e = { t: Date.now() - t0, kind, payload: data, ...data };
    events.push(e);
    for (const s of subscribers) {
      // fire-and-forget; subscribers must not throw, but if they do, swallow
      Promise.resolve().then(() => s(e)).catch(() => {});
    }
  }

  return {
    /** seconds since run start as "+12.34s" */
    sec: () => ((Date.now() - t0) / 1000).toFixed(2),
    /** ms since run start (raw number) */
    ms: () => Date.now() - t0,
    /** push an event onto the timeline (also delivered to subscribers) */
    ev,
    /** stdout log with elapsed prefix */
    log: (m) => console.log(`+${((Date.now() - t0) / 1000).toFixed(2)}s ${m}`),
    /** read-only snapshot for reporters */
    snapshot: () => events.slice(),
    /** subscribe to live events (instruments only). Returns an unsubscribe fn. */
    onEvent: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    t0,
  };
}
