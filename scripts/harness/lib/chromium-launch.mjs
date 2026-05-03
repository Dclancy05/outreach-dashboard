// Shared Chromium launch helper. Every scenario uses this so VPS DNS mapping
// + sandbox flags are consistent. Lifted from popup-deep-diagnostic.mjs.

import { chromium } from "playwright";

export async function launchChromium({ viewport = { width: 1400, height: 900 } } = {}) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--host-resolver-rules=MAP srv1197943.taild42583.ts.net 209.177.145.97",
      "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}
