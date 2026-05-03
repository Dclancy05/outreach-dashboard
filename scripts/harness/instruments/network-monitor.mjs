// Network monitor — captures every dashboard fetch + every VPS request.
// Filters to /api/* and srv1197943.* so timeline isn't drowned by static assets.

const RELEVANT = /\/api\/(platforms|recordings|accounts|auth|observability|automation|memories|agents|workflows|runs|cron)/;
const VPS = /srv1197943\.|\/websockify/;

export function networkMonitor({ ev, page }) {
  const onRequest = (req) => {
    const url = req.url();
    if (RELEVANT.test(url) || VPS.test(url)) {
      ev("net.request", {
        method: req.method(),
        url,
        body: (() => { try { return req.postDataJSON(); } catch { return null; } })(),
      });
    }
  };
  const onResponse = (res) => {
    const url = res.url();
    if (RELEVANT.test(url) || VPS.test(url)) {
      ev("net.response", { url, status: res.status() });
    }
  };
  const onWebSocket = (ws) => {
    ev("ws.open", { url: ws.url() });
    let frames = 0, bytes = 0;
    ws.on("framereceived", (f) => { frames++; bytes += (f.payload?.length ?? 0); });
    ws.on("close", () => ev("ws.close", { url: ws.url(), frames, bytes }));
  };

  return {
    start() {
      page.on("request", onRequest);
      page.on("response", onResponse);
      page.on("websocket", onWebSocket);
    },
    stop() {
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("websocket", onWebSocket);
    },
  };
}
