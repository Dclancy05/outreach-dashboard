import crypto from "crypto"

const SCRYPT_N = 16384
const SCRYPT_r = 8
const SCRYPT_p = 1
const KEYLEN = 32
const SALT_LEN = 16
const SCHEME = "scrypt$v1"

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN)
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(pin, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p }, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
  return `${SCHEME}$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("base64")}$${derived.toString("base64")}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$")
  if (parts.length !== 7 || `${parts[0]}$${parts[1]}` !== SCHEME) return false
  const N = parseInt(parts[2], 10)
  const r = parseInt(parts[3], 10)
  const p = parseInt(parts[4], 10)
  const salt = Buffer.from(parts[5], "base64")
  const expected = Buffer.from(parts[6], "base64")
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(pin, salt, expected.length, { N, r, p }, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
  if (derived.length !== expected.length) return false
  return crypto.timingSafeEqual(derived, expected)
}
