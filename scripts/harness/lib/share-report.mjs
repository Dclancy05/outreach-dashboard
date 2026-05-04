// Optional: copy a harness run dir into the memory-vault tree so it gets
// served via the existing Tailscale Funnel. Skipped unless SHARE_REPORTS=1
// because we don't want to publish every local dev run.
//
// Memory-vault file-server is exposed at:
//   https://srv1197943.taild42583.ts.net:8443/vault
// (per CLAUDE.md). Files dropped under /root/memory-vault/ show up there.
//
// Usage from run.mjs:
//   await maybeShare(outDir, scenarioName);

import fs from "node:fs";
import path from "node:path";

const VAULT_ROOT = "/root/memory-vault/test-runs";
const FUNNEL_BASE = "https://srv1197943.taild42583.ts.net:8443/vault/test-runs";

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}

export async function maybeShare(outDir, scenarioName) {
  if (process.env.SHARE_REPORTS !== "1") return null;
  if (!fs.existsSync(VAULT_ROOT)) {
    try {
      fs.mkdirSync(VAULT_ROOT, { recursive: true });
    } catch (e) {
      console.warn(`[share] could not create ${VAULT_ROOT}: ${e.message}`);
      return null;
    }
  }
  const stamp = path.basename(outDir);
  const dst = path.join(VAULT_ROOT, stamp);
  try {
    copyRecursive(outDir, dst);
  } catch (e) {
    console.warn(`[share] copy failed: ${e.message}`);
    return null;
  }
  const url = `${FUNNEL_BASE}/${stamp}/report.html`;
  console.log(`\n📡 Shared: ${url}`);
  return url;
}
