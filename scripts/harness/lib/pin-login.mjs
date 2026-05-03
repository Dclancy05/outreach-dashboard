// PIN keypad helper — every scenario starts with this. Extracted from
// popup-deep-diagnostic.mjs + ban-risk-smoke.mjs (identical logic, dedup'd).

export async function pinLogin(page, { pin, ev }) {
  const onPin = await page.evaluate(() => /Enter Passcode/i.test(document.body.textContent || ""));
  if (!onPin) {
    ev("flow.pin_skipped", {});
    return false;
  }
  ev("flow.pin_start", {});
  for (const d of pin) {
    await page.evaluate((digit) => {
      const btns = Array.from(document.querySelectorAll("button"));
      const t = btns.find((b) => {
        const s = (b.textContent || "").replace(/\s+/g, "");
        return s === digit || (s.length <= 5 && s.startsWith(digit));
      });
      if (t) t.click();
    }, d);
    await page.waitForTimeout(120);
  }
  await page.waitForURL(/\/(accounts|automations|agency|jarvis)/, { timeout: 8000 }).catch(() => {});
  ev("flow.pin_done", { url: page.url() });
  return true;
}
