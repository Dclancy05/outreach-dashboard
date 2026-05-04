// Read-only Supabase access for harness scenarios.
//
// The harness runs server-side (node, not the browser), so we use the service
// role key. Reads .env.local on first import so scenarios don't have to wrap
// every script with --env-file. Never logs key material.
//
// Usage from a scenario:
//   import { getActiveSession, assertFreshSession } from "../lib/db.mjs";
//   const r = await assertFreshSession(account_id, 120);
//   if (!r.ok) throw new Error(r.detail);

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname || ".", "..", "..", "..");
const envFile = path.join(repoRoot, ".env.local");
if (existsSync(envFile)) loadEnv({ path: envFile, quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn("[harness/db] Supabase env not set — DB assertions will return ok:false");
}

export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: false } })
  : null;

export async function getAccount(accountId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) return { _error: error.message };
  return data || null;
}

export async function getActiveSession(accountId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("account_sessions")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { _error: error.message };
  return data || null;
}

export async function getRecentSnapshots(accountId, limit = 3) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("account_cookie_snapshots")
    .select("id, account_id, captured_at, captured_by, cookie_count, platform")
    .eq("account_id", accountId)
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

// Returns { ok, detail, row } — ok=true iff there is an active session whose
// last_verified_at (or created_at fallback) is within `withinSecs` of now AND
// it has at least one cookie in its jar. Mirrors what the dashboard's
// get_accounts handler trusts (src/lib/api/accounts.ts:81-134).
export async function assertFreshSession(accountId, withinSecs = 120) {
  if (!supabase) {
    return { ok: false, detail: "supabase env not set", row: null };
  }
  const row = await getActiveSession(accountId);
  if (!row) {
    return { ok: false, detail: "no active session row", row: null };
  }
  if (row._error) {
    return { ok: false, detail: row._error, row: null };
  }
  const ts = row.last_verified_at || row.created_at;
  if (!ts) {
    return { ok: false, detail: "session row has no timestamp", row };
  }
  const ageMs = Date.now() - new Date(ts).getTime();
  if (ageMs > withinSecs * 1000) {
    return {
      ok: false,
      detail: `session is ${(ageMs / 1000).toFixed(1)}s old (limit ${withinSecs}s)`,
      row,
    };
  }
  const cookies = Array.isArray(row.cookies) ? row.cookies : [];
  if (cookies.length === 0) {
    return { ok: false, detail: "session has empty cookies array", row };
  }
  return { ok: true, detail: `fresh session, age=${(ageMs / 1000).toFixed(1)}s, cookies=${cookies.length}`, row };
}

// Convenience for scenarios that walk multiple accounts. Returns a summary.
export async function snapshotAllStatuses(accountIds) {
  const out = [];
  for (const id of accountIds) {
    const acct = await getAccount(id);
    const sess = await getActiveSession(id);
    out.push({
      account_id: id,
      platform: acct?.platform || null,
      username: acct?.username || null,
      session_age_s: sess?.last_verified_at
        ? Math.round((Date.now() - new Date(sess.last_verified_at).getTime()) / 1000)
        : null,
      session_cookies_count: Array.isArray(sess?.cookies) ? sess.cookies.length : 0,
    });
  }
  return out;
}
