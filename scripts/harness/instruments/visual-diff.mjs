// Visual-diff instrument — perceptual hashing on consecutive screenshots
// to detect "stutter signatures" (UI froze and then snapped).
//
// Lazy-loads `sharp` only when invoked so the harness still runs without
// it installed (sharp is a heavy native dep).
//
// A stutter signature = 5+ consecutive identical pHashes followed by a
// sudden jump (Hamming distance > 16). Means "nothing changed for ~2.5s
// then something changed a lot" — that's a freeze.

import fs from "node:fs";
import path from "node:path";

async function tryLoadSharp() {
  try {
    const m = await import("sharp");
    return m.default || m;
  } catch {
    return null;
  }
}

// 8x8 mean-luminance hash → 64-bit value. Cheap and effective.
async function pHash(sharp, file) {
  const { data } = await sharp(file)
    .greyscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let mean = 0;
  for (const b of data) mean += b;
  mean /= data.length;
  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    if (data[i] >= mean) bits |= (1n << BigInt(i));
  }
  return bits;
}

function hamming(a, b) {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

export function visualDiff({ ev, outDir }) {
  return {
    async analyze() {
      const sharp = await tryLoadSharp();
      if (!sharp) {
        ev("visual_diff.skipped", { reason: "sharp not installed" });
        return { skipped: true };
      }
      const dir = path.join(outDir, "screenshots");
      if (!fs.existsSync(dir)) {
        ev("visual_diff.skipped", { reason: "no screenshots" });
        return { skipped: true };
      }
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
      if (files.length < 6) {
        ev("visual_diff.skipped", { reason: `only ${files.length} screenshots` });
        return { skipped: true };
      }
      const hashes = [];
      for (const f of files) {
        try { hashes.push(await pHash(sharp, path.join(dir, f))); } catch { hashes.push(null); }
      }
      const stutters = [];
      let runLen = 0;
      let runStart = 0;
      for (let i = 1; i < hashes.length; i++) {
        if (hashes[i] === null || hashes[i - 1] === null) { runLen = 0; continue; }
        const dist = hamming(hashes[i], hashes[i - 1]);
        if (dist <= 2) {
          if (runLen === 0) runStart = i - 1;
          runLen++;
        } else {
          if (runLen >= 5 && dist > 16) {
            stutters.push({ from: runStart, to: i, runLen, jumpDist: dist });
          }
          runLen = 0;
        }
      }
      const report = {
        frames: files.length,
        stutter_count: stutters.length,
        stutters: stutters.slice(0, 20),
      };
      ev("visual_diff.report", report);
      return report;
    },
  };
}
