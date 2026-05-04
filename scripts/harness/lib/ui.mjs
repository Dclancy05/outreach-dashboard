// UI helpers for harness scenarios. Wraps the brittle DOM-query patterns we
// keep rewriting in every scenario. Each helper takes a Playwright `page` and
// returns Plain Old JS Values — never an ElementHandle, so scenarios stay
// retry-friendly.

const BLOCKING_BADGE = /expired|needs sign[- ]?in|needs login/i;
const PASSING_BADGE = /\b(active|saved|warming|fresh|verified)\b/i;

// Find every account card. We use the lucide-<platform> SVG class as the
// authoritative platform signal (substring matching on text content was
// matching "x" inside "Expired" — broken). Each card has:
//   - exactly one platform SVG (lucide-instagram | lucide-facebook | ...)
//   - one @handle text node
//   - a badge whose text is one of: Active | Expired | Needs Sign-In | Warming
//   - optionally a "Sign In Now" button
const PLATFORM_ICONS = [
  "instagram", "facebook", "linkedin", "tiktok", "youtube",
  "twitter", "x", "snapchat", "pinterest", "reddit", "threads",
];

export async function listAccountRows(page) {
  return page.evaluate(({ blocking, passing, platforms }) => {
    const blockRe = new RegExp(blocking, "i");
    const passRe = new RegExp(passing, "i");
    const STATUS_RE = /^(active|expired|needs sign[- ]?in|warming|saved just now|saved \d+m? ago)$/i;
    // Anchored, length-bounded — username is just letters + dots + underscores
    // before any platform-name boundary
    const USER_RE = /^([A-Za-z][\w._-]{1,30})$/;

    // Find leaf badge spans whose text exactly matches a status word, walk up
    // to the nearest account-card ancestor. This avoids matching the 90+
    // unassigned cards which have no badge.
    const badgeNodes = Array.from(document.querySelectorAll("span, div")).filter((el) => {
      if (el.children.length > 0) return false; // leaf only
      const t = (el.textContent || "").trim();
      return STATUS_RE.test(t);
    });

    const out = [];
    const seen = new Set();
    for (const badge of badgeNodes) {
      let card = badge.closest("[class*='rounded-xl']");
      // Bail out if the card looks like a "Group" header (has 4+ child cards inside it)
      if (!card) continue;
      if (card.querySelectorAll("[class*='rounded-xl']").length >= 3) continue;
      if (seen.has(card)) continue;
      seen.add(card);

      // Platform from lucide-<platform> svg, exact word
      let platform = null;
      const svgs = card.querySelectorAll("svg[class*='lucide-']");
      for (const s of svgs) {
        const cls = (s.getAttribute("class") || "").toLowerCase();
        for (const p of platforms) {
          if (new RegExp("\\blucide-" + p + "\\b").test(cls)) { platform = p; break; }
        }
        if (platform) break;
      }
      if (!platform) continue;

      // Username from a leaf @handle node — exact match only, no run-on
      let username = null;
      const handleNodes = Array.from(card.querySelectorAll("span, div, p")).filter((el) => {
        if (el.children.length > 0) return false;
        const t = (el.textContent || "").trim();
        return t.length > 1 && t.startsWith("@");
      });
      if (handleNodes.length > 0) {
        const raw = handleNodes[0].textContent.trim().replace(/^@/, "");
        if (USER_RE.test(raw)) username = raw;
      }
      if (!username) continue;

      const statusText = badge.textContent.trim();
      const status = blockRe.test(statusText) ? "blocking"
                   : passRe.test(statusText) ? "passing"
                   : "unknown";
      const btnText = Array.from(card.querySelectorAll("button"))
        .map((b) => b.textContent.trim().toLowerCase()).join("|");
      const hasSignInButton = /sign in now/i.test(btnText);

      out.push({
        platform, username, statusText, status, hasSignInButton,
        rowText: (card.textContent || "").trim().slice(0, 160),
      });
    }
    return out;
  }, {
    blocking: BLOCKING_BADGE.source,
    passing: PASSING_BADGE.source,
    platforms: PLATFORM_ICONS,
  });
}

export async function readBadge(page, { platform, username }) {
  const rows = await listAccountRows(page);
  return rows.find((r) =>
    (!platform || r.platform === platform) &&
    (!username || (r.username || "").toLowerCase() === username.toLowerCase())
  ) || null;
}

// Click the Sign-In-Now button in the card whose lucide-<platform> svg matches.
// `username` is an optional disambiguator (lower-cased substring).
export async function clickSignInNow(page, { platform, username = null }) {
  return page.evaluate(({ wantPlatform, wantUser }) => {
    const cards = Array.from(document.querySelectorAll(
      "[class*='rounded-xl'][class*='border-l-4']"
    ));
    for (const card of cards) {
      const hasIcon = card.querySelector(`svg[class*='lucide-${wantPlatform}']`);
      if (!hasIcon) continue;
      if (wantUser) {
        const t = (card.textContent || "").toLowerCase();
        if (!t.includes(wantUser.toLowerCase())) continue;
      }
      const btn = Array.from(card.querySelectorAll("button"))
        .find((b) => /sign in now/i.test(b.textContent || ""));
      if (btn) {
        btn.scrollIntoView({ block: "center" });
        btn.click();
        return true;
      }
    }
    return false;
  }, { wantPlatform: platform, wantUser: username });
}

// Click the I'm Logged In button in any open modal.
export async function clickImLoggedIn(page) {
  return page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button"))
      .find((x) => /i.?m logged in/i.test(x.textContent || ""));
    if (b) { b.scrollIntoView({ block: "center" }); b.click(); return true; }
    return false;
  });
}

export async function dismissAnyModal(page) {
  return page.evaluate(() => {
    // Common close patterns: X icon button with aria-label "Close", or any
    // button that contains a single x/close icon.
    const closes = Array.from(document.querySelectorAll("button[aria-label*='Close' i], button[aria-label*='close' i]"));
    if (closes[0]) { closes[0].click(); return true; }
    // Press Escape as fallback
    return false;
  });
}

// Polls readBadge until the predicate matches or timeout. We use a tiered
// strategy: start with optimistic re-reads, then click Refresh, then full
// reload. This handles SWR cache + dashboard cache layers without burning
// time on early reads.
export async function waitForBadge(page, { platform, username }, predicate, opts = {}) {
  const timeout = opts.timeout || 30000;
  const interval = opts.interval || 2500;
  const reloadAfterMs = opts.reloadAfterMs ?? 8000;
  const start = Date.now();
  let last = null;
  let reloaded = false;
  while (Date.now() - start < timeout) {
    last = await readBadge(page, { platform, username });
    if (last && predicate(last)) return { ok: true, badge: last, waitedMs: Date.now() - start };

    const elapsed = Date.now() - start;
    if (elapsed > reloadAfterMs && !reloaded) {
      // Hard reload — bypasses SWR
      reloaded = true;
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(2000);
      continue;
    }
    // Click the Refresh button if present
    await page.evaluate(() => {
      const r = Array.from(document.querySelectorAll("button"))
        .find((x) => /^\s*refresh\s*$/i.test(x.textContent || ""));
      if (r) r.click();
    }).catch(() => {});
    await page.waitForTimeout(interval);
  }
  return { ok: false, badge: last, waitedMs: Date.now() - start };
}

// Lists all currently-blocking rows, useful for "find work to do" + final
// pass/fail count.
export async function countBlockingRows(page) {
  const rows = await listAccountRows(page);
  return rows.filter((r) => r.status === "blocking").length;
}

export async function pickFirstBlockingRow(page) {
  const rows = await listAccountRows(page);
  return rows.find((r) => r.status === "blocking" && r.hasSignInButton) || null;
}
