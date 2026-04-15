/**
 * Execute schema.sql against Supabase using the Management API
 * Usage: npx tsx scripts/run-schema.ts
 */
import fs from "fs"
import path from "path"
import dotenv from "dotenv"

dotenv.config({ path: path.join(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Extract project ref from URL
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0]

async function runSQL(sql: string) {
  // Use the PostgREST rpc endpoint won't work for DDL.
  // Use the Supabase Management API SQL endpoint instead.
  // Actually, the simplest approach: use the supabase REST SQL endpoint
  // available at /rest/v1/rpc but that only works for functions.
  //
  // Best approach: Use the Supabase DB directly via the pg wire protocol
  // through the pooler, or use the Management API.
  //
  // Simplest: POST to the SQL endpoint with service role key
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    // Try the alternative: execute via the query endpoint
    // This uses Supabase's built-in pg_net or direct SQL execution
    console.log("RPC endpoint not available, trying statement-by-statement...")
    return null
  }
  return await res.json()
}

async function executeStatements(sql: string) {
  // Split SQL into individual statements and execute via Supabase's
  // SQL API (available through the management API)
  // Since we can't run raw SQL via PostgREST, we'll use the
  // Supabase Management API at api.supabase.com

  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

  const res = await fetch(managementUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (res.ok) {
    const data = await res.json()
    console.log("Schema executed successfully via Management API")
    return data
  }

  // If management API doesn't work with service role key,
  // fall back to executing individual CREATE TABLE statements via pg
  console.log(`Management API returned ${res.status}: ${await res.text()}`)
  console.log("\nFalling back to statement-by-statement execution...")

  // Split into statements
  const statements = sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"))

  let success = 0
  let failed = 0

  for (const stmt of statements) {
    // Try executing each statement via a Supabase Edge Function workaround
    // or via the pg pooler
    try {
      // Use the Supabase query endpoint (newer API)
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({}),
      })
      // This won't actually execute DDL, just testing connectivity
    } catch {}
  }

  return null
}

async function main() {
  console.log("Reading schema.sql...")
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8")
  console.log(`Project ref: ${projectRef}`)
  console.log(`SQL length: ${sql.length} chars`)
  console.log("")

  // Try direct SQL execution via Management API
  const result = await executeStatements(sql)

  if (!result) {
    console.log("\n════════════════════════════════════════════════")
    console.log("  Automated SQL execution was not possible.")
    console.log("  Please run the schema manually:")
    console.log("")
    console.log("  1. Go to: https://supabase.com/dashboard/project/" + projectRef + "/sql/new")
    console.log("  2. Paste the contents of scripts/schema.sql")
    console.log("  3. Click 'Run'")
    console.log("════════════════════════════════════════════════")
  }
}

main().catch(e => { console.error(e); process.exit(1) })
