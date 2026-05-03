// Screenshot every N ms (default 500). Saves PNGs to outDir/screenshots/
// with sequential numbering + elapsed-second tags so a reporter can build
// a video-like flipbook of the run.

import fs from "node:fs";
import path from "node:path";

export function screenshotStream({ ev, page, outDir, intervalMs = 500 }) {
  const dir = path.join(outDir, "screenshots");
  fs.mkdirSync(dir, { recursive: true });
  let idx = 0;
  let interval = null;

  return {
    start() {
      interval = setInterval(async () => {
        idx++;
        const file = path.join(
          dir,
          `${String(idx).padStart(4, "0")}.png`,
        );
        await page.screenshot({ path: file }).catch(() => {});
        ev("shot", { idx, file });
      }, intervalMs);
    },
    stop() {
      if (interval) clearInterval(interval);
      interval = null;
    },
    count: () => idx,
  };
}
