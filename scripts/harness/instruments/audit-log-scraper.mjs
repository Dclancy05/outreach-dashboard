// Post-run audit log scrape. Hits /api/observability/chrome-goto?minutes=N
// and pushes the result onto the timeline so reporters can cross-check
// "what the dashboard saw" vs "what the audit log recorded."
//
// Endpoint built in Wave 0.7. If it returns 404, this is a no-op.

import http from "node:http";
import https from "node:https";

export function auditLogScraper({ ev, dashboardUrl, sessionCookie }) {
  return {
    async scrape({ minutes = 5 } = {}) {
      const u = new URL(`/api/observability/chrome-goto?minutes=${minutes}`, dashboardUrl);
      const lib = u.protocol === "https:" ? https : http;
      const headers = sessionCookie ? { Cookie: sessionCookie } : {};
      return new Promise((resolve) => {
        const req = lib.get(u, { headers }, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              ev("audit.scrape", {
                minutes,
                status: res.statusCode,
                count: parsed?.count ?? 0,
                by_platform: parsed?.by_platform ?? {},
                timeline: (parsed?.timeline ?? []).slice(0, 100),
              });
              resolve(parsed);
            } catch {
              ev("audit.scrape_error", { status: res.statusCode, body: body.slice(0, 200) });
              resolve(null);
            }
          });
        });
        req.on("error", (e) => {
          ev("audit.scrape_error", { error: String(e) });
          resolve(null);
        });
        req.setTimeout(5000, () => req.destroy());
      });
    },
  };
}
