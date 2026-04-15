/**
 * One-time migration script: Google Sheets → Supabase
 *
 * Usage:
 *   npx tsx scripts/migrate-to-supabase.ts
 *
 * Prerequisites:
 *   - Supabase tables created (run scripts/schema.sql first)
 *   - .env.local has SUPABASE_SERVICE_ROLE_KEY
 *   - Google Sheets credentials at ~/.config/google-sheets-mcp/
 */

import { google } from "googleapis"
import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"
import dotenv from "dotenv"

// Load .env.local
dotenv.config({ path: path.join(__dirname, "../.env.local") })

const SPREADSHEET_ID = "1IKyh9fS2bsXxPOhU-kzGdwYF_dr9vmT-eGkrMGXBduc"

const CREDENTIALS_PATH = path.join(process.env.HOME || "", ".config/google-sheets-mcp/credentials.json")
const TOKEN_PATH = path.join(process.env.HOME || "", ".config/google-sheets-mcp/token.json")

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Google Sheets Auth ─────────────────────────────────────────────

async function getSheets() {
  const credRaw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"))
  const cred = credRaw.installed || credRaw.web
  const tokenRaw = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"))

  const oauth2 = new google.auth.OAuth2(cred.client_id, cred.client_secret, cred.redirect_uris?.[0])
  oauth2.setCredentials(tokenRaw)

  oauth2.on("tokens", (tokens) => {
    const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"))
    const updated = { ...existing, ...tokens }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2))
  })

  return google.sheets({ version: "v4", auth: oauth2 })
}

function rowsToObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = row[i] || "" })
    return obj
  })
}

async function readSheet(sheets: ReturnType<typeof google.sheets>, sheetName: string, range = "A:AZ"): Promise<Record<string, string>[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${range}`,
  })
  const rows = res.data.values || []
  if (rows.length < 2) return []
  const headers = rows[0]
  return rowsToObjects(headers, rows.slice(1))
}

// ─── Migration Logic ────────────────────────────────────────────────

const BATCH_SIZE = 500

async function migrateTable(
  sheets: ReturnType<typeof google.sheets>,
  sheetName: string,
  tableName: string,
  transform?: (rows: Record<string, string>[]) => Record<string, string>[],
  range?: string
) {
  console.log(`\n── Migrating: ${sheetName} → ${tableName} ──`)

  let rows: Record<string, string>[]
  try {
    rows = await readSheet(sheets, sheetName, range)
  } catch (e) {
    console.log(`  ⚠ Sheet "${sheetName}" not found or empty, skipping`)
    return { sheet: sheetName, table: tableName, sheetsCount: 0, supabaseCount: 0, ok: true }
  }

  if (rows.length === 0) {
    console.log(`  0 rows in sheet, skipping`)
    return { sheet: sheetName, table: tableName, sheetsCount: 0, supabaseCount: 0, ok: true }
  }

  console.log(`  Read ${rows.length} rows from Google Sheets`)

  if (transform) {
    rows = transform(rows)
    console.log(`  After transform: ${rows.length} rows`)
  }

  let inserted = 0
  let errors = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from(tableName).upsert(batch, { onConflict: getPrimaryKey(tableName) })
    if (error) {
      console.error(`  ✗ Batch ${i}-${i + batch.length}: ${error.message}`)
      errors++
    } else {
      inserted += batch.length
      console.log(`  ✓ Batch ${i}-${i + batch.length} (${inserted}/${rows.length})`)
    }
  }

  // Verify count
  const { count } = await supabase.from(tableName).select("*", { count: "exact", head: true })
  const supabaseCount = count || 0

  if (supabaseCount >= rows.length) {
    console.log(`  ✓ Verified: ${supabaseCount} rows in Supabase (expected ≥ ${rows.length})`)
  } else {
    console.error(`  ✗ Count mismatch: ${supabaseCount} in Supabase vs ${rows.length} expected`)
  }

  return { sheet: sheetName, table: tableName, sheetsCount: rows.length, supabaseCount, ok: errors === 0 && supabaseCount >= rows.length }
}

function getPrimaryKey(table: string): string {
  const keys: Record<string, string> = {
    leads: "lead_id",
    messages: "message_id",
    sequences: "sequence_id",
    accounts: "account_id",
    ab_tests: "test_id",
    approaches: "approach_id",
    smart_lists: "list_id",
    activity: "activity_id",
    outreach_log: "log_id",
    settings: "setting_name",
  }
  return keys[table] || "id"
}

// ─── Special transforms ─────────────────────────────────────────────

function transformSequences(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) => {
    const steps: Record<string, string> = {}
    for (const [key, val] of Object.entries(row)) {
      if (key.startsWith("Day ") && val) {
        steps[`day_${key.replace("Day ", "")}`] = val
      }
    }
    return {
      sequence_id: row.sequence_id || "",
      sequence_name: row.sequence_name || "",
      steps: JSON.stringify(steps),
    }
  }).filter(r => r.sequence_id)
}

function transformSettings(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.filter(r => r.setting_name).map(r => ({
    setting_name: r.setting_name,
    setting_value: r.setting_value || "",
  }))
}

function transformLeads(rows: Record<string, string>[]): Record<string, string>[] {
  // Deduplicate by lead_id (keep last occurrence)
  const seen = new Map<string, Record<string, string>>()
  for (const row of rows) {
    if (!row.lead_id && !row.name) continue
    if (row.lead_id) seen.set(row.lead_id, row)
    else seen.set(`_no_id_${seen.size}`, row)
  }
  return [...seen.values()]
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════")
  console.log("  Google Sheets → Supabase Migration")
  console.log("═══════════════════════════════════════════════════")
  console.log(`Supabase URL: ${supabaseUrl}`)
  console.log(`Spreadsheet: ${SPREADSHEET_ID}`)

  const sheets = await getSheets()

  const results = []

  results.push(await migrateTable(sheets, "Leads", "leads", transformLeads))
  results.push(await migrateTable(sheets, "Messages", "messages"))
  results.push(await migrateTable(sheets, "Sequences", "sequences", transformSequences))
  results.push(await migrateTable(sheets, "Accounts", "accounts"))
  results.push(await migrateTable(sheets, "AB Tests", "ab_tests"))
  results.push(await migrateTable(sheets, "Approaches", "approaches"))
  results.push(await migrateTable(sheets, "Smart Lists", "smart_lists"))
  results.push(await migrateTable(sheets, "Activity", "activity"))
  results.push(await migrateTable(sheets, "Outreach Log", "outreach_log"))
  results.push(await migrateTable(sheets, "Settings", "settings", transformSettings, "A:B"))

  console.log("\n═══════════════════════════════════════════════════")
  console.log("  Migration Summary")
  console.log("═══════════════════════════════════════════════════")
  let allOk = true
  for (const r of results) {
    const status = r.ok ? "✓" : "✗"
    console.log(`  ${status} ${r.sheet.padEnd(15)} → ${r.table.padEnd(15)} | Sheets: ${r.sheetsCount} | Supabase: ${r.supabaseCount}`)
    if (!r.ok) allOk = false
  }
  console.log("═══════════════════════════════════════════════════")
  if (allOk) {
    console.log("  ✓ All tables migrated successfully!")
  } else {
    console.log("  ✗ Some tables had issues — check errors above")
  }
  console.log("═══════════════════════════════════════════════════")
}

main().catch((e) => {
  console.error("Migration failed:", e)
  process.exit(1)
})
