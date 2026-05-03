// CDP target poller — watches the production VPS Chrome's tab list every
// 250ms, emits cdp.target_created / cdp.target_destroyed / cdp.target_navigated.
//
// This is the instrument that catches "the popup spawned 4 zombie tabs"
// (the 2026-05-02 incident). Lifted verbatim from popup-deep-diagnostic.mjs.

import http from "node:http";

const POLL_MS = 250;

function cdpFetch(cdpUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${cdpUrl}/json`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.setTimeout(2000, () => req.destroy());
  });
}

export function cdpTargetEvents({ ev, cdpUrl = "http://localhost:18800" }) {
  let prev = new Map();
  let interval = null;

  return {
    async start() {
      const initial = await cdpFetch(cdpUrl);
      for (const t of initial) prev.set(t.id, t);
      ev("cdp.snapshot", {
        count: initial.length,
        targets: initial.map((t) => ({ type: t.type, title: t.title, url: t.url })),
      });
      interval = setInterval(async () => {
        const cur = await cdpFetch(cdpUrl);
        const curMap = new Map();
        for (const t of cur) curMap.set(t.id, t);
        for (const [id, t] of curMap) {
          const p = prev.get(id);
          if (!p) {
            ev("cdp.target_created", { id, type: t.type, title: t.title, url: t.url });
          } else if (p.url !== t.url) {
            ev("cdp.target_navigated", { id, type: t.type, title: t.title, fromUrl: p.url, toUrl: t.url });
          }
        }
        for (const [id, t] of prev) {
          if (!curMap.has(id)) {
            ev("cdp.target_destroyed", { id, type: t.type, title: t.title, url: t.url });
          }
        }
        prev = curMap;
      }, POLL_MS);
    },
    stop() {
      if (interval) clearInterval(interval);
      interval = null;
    },
  };
}
