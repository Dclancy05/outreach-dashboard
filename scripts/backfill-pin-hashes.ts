import path from "path"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

dotenv.config({ path: path.join(__dirname, "../.env.local") })

const SCRYPT_N = 16384
const SCRYPT_r = 8
const SCRYPT_p = 1
const KEYLEN = 32
const SALT_LEN = 16
const SCHEME = "scrypt$v1"

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN)
  const derived: Buffer = await new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p }, (err, key) => {
      if (err) reject(err)
      else resolve(key as Buffer)
    })
  })
  return `${SCHEME}$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("base64")}$${derived.toString("base64")}`
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const sb = createClient(url, key)

  const { data, error } = await sb.from("team_members").select("id, pin, pin_hash")
  if (error) {
    console.error("fetch error:", error.message)
    process.exit(1)
  }
  console.log(`Found ${data?.length || 0} rows`)
  let updated = 0
  let skipped = 0
  for (const row of data || []) {
    if (row.pin_hash) { skipped++; continue }
    if (!row.pin || typeof row.pin !== "string") { skipped++; continue }
    const h = await hashPin(row.pin)
    const { error: upErr } = await sb.from("team_members").update({ pin_hash: h }).eq("id", row.id)
    if (upErr) {
      console.error(`update failed for ${row.id}:`, upErr.message)
      continue
    }
    updated++
  }
  console.log(`Done. Updated: ${updated}, skipped: ${skipped}`)
}

main().catch(e => { console.error(e); process.exit(1) })
