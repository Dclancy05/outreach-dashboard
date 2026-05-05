#!/usr/bin/env node
/**
 * Unit-test-style smoke for platform-action-targets — runs without
 * Jest/Vitest because this repo doesn't have either set up. Exits 0
 * if all assertions pass, 1 otherwise. Pre-commit gate for changes
 * to PLATFORM_ACTION_TARGETS.
 */

import {
  PLATFORM_ACTION_TARGETS,
  getActionTarget,
  getRecordUrl,
  buildLegacySafeTestTargets,
  buildLegacyTestTargets,
} from "../src/lib/automations/platform-action-targets.ts"

let failures = 0
function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`)
    failures++
  }
}

// 1. All known platforms have at least one action.
const platforms = ["ig", "fb", "li", "tiktok", "youtube", "x", "reddit", "snapchat", "pinterest"]
for (const p of platforms) {
  const actions = PLATFORM_ACTION_TARGETS[p]
  assert(actions && Object.keys(actions).length > 0, `${p} should have actions`)
}

// 2. Every action has all 3 required fields.
for (const [p, actions] of Object.entries(PLATFORM_ACTION_TARGETS)) {
  if (!actions) continue
  for (const [a, t] of Object.entries(actions)) {
    assert(typeof t.recordUrl === "string" && t.recordUrl.startsWith("http"), `${p}.${a} recordUrl must be http URL`)
    assert(typeof t.testUrl === "string" && t.testUrl.startsWith("http"), `${p}.${a} testUrl must be http URL`)
    assert(typeof t.testTargetName === "string" && t.testTargetName.length > 0, `${p}.${a} testTargetName must be non-empty`)
  }
}

// 3. DM actions all have skipSendOnTest:true (ban-risk policy).
for (const [p, actions] of Object.entries(PLATFORM_ACTION_TARGETS)) {
  if (!actions) continue
  for (const [a, t] of Object.entries(actions)) {
    if (a === "dm" || a === "reply" || a === "comment" || a === "post" || a === "connect") {
      assert(t.skipSendOnTest === true, `${p}.${a} should have skipSendOnTest=true (ban risk)`)
    }
  }
}

// 4. getActionTarget returns the right shape.
const igDm = getActionTarget("ig", "dm")
assert(igDm && igDm.recordUrl.includes("instagram.com"), "getActionTarget('ig', 'dm') should return IG target")
assert(getActionTarget("nonexistent", "dm") === undefined, "unknown platform → undefined")
assert(getActionTarget("ig", "nonexistent") === undefined, "unknown action → undefined")

// 5. getActionTarget is case-insensitive.
assert(getActionTarget("IG", "DM") !== undefined, "case-insensitive lookup")
assert(getActionTarget("Ig", "Dm") !== undefined, "mixed case lookup")

// 6. getActionTarget handles empty / null inputs gracefully.
assert(getActionTarget("", "") === undefined, "empty inputs → undefined")
assert(getActionTarget(null, "dm") === undefined, "null platform → undefined")
assert(getActionTarget("ig", null) === undefined, "null action → undefined")

// 7. getRecordUrl falls back when target is missing.
assert(getRecordUrl("ig", "dm") === PLATFORM_ACTION_TARGETS.ig.dm.recordUrl, "known target → recordUrl")
assert(getRecordUrl("ig", "unknown") === "https://www.instagram.com/", "unknown action → IG homepage")
assert(getRecordUrl("nonexistent", "dm") === "about:blank", "unknown platform + action → about:blank")

// 8. Bug #15 — getRecordUrl handles undefined platform without throwing.
try {
  const r = getRecordUrl(undefined, "dm")
  assert(r === "about:blank", "undefined platform → about:blank")
} catch (e) {
  assert(false, `getRecordUrl(undefined, ...) should not throw: ${e.message}`)
}

// 9. Legacy shape conversions return non-empty objects.
const legacy = buildLegacySafeTestTargets()
assert(typeof legacy.ig?.dm === "string", "buildLegacySafeTestTargets shape")
const legacyTest = buildLegacyTestTargets()
assert(legacyTest.ig?.dm?.skipSend === true, "buildLegacyTestTargets preserves skipSend")
assert(legacyTest.ig?.dm?.url?.includes("instagram"), "buildLegacyTestTargets has urls")

// Summary
if (failures === 0) {
  const totalActions = Object.values(PLATFORM_ACTION_TARGETS).reduce(
    (s, a) => s + Object.keys(a || {}).length, 0
  )
  console.log(`✓ All assertions pass (${platforms.length} platforms, ${totalActions} actions)`)
  process.exit(0)
} else {
  console.error(`\n✗ ${failures} assertion(s) failed`)
  process.exit(1)
}
