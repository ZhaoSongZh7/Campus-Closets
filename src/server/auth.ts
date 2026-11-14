import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { cookies, headers } from "next/headers"

import { db } from "./db"

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>

const COOKIE = "mutuari_session"
const SESSION_DAYS = 30
const LOG_N = 15
const params = (logN: number) => ({ N: 2 ** logN, r: 8, p: 1, maxmem: 128 * 1024 * 1024 })

/** Returns `scrypt$<logN>$<salt>$<hash>` (base64url parts). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64, params(LOG_N))
  return `scrypt$${LOG_N}$${salt.toString("base64url")}$${hash.toString("base64url")}`
}

export async function verifyPassword(password: string, stored: string | null) {
  const [scheme, logN, salt, hash] = (stored ?? "").split("$")
  if (scheme !== "scrypt" || !logN || !salt || !hash) {
    // Spend comparable time when there is no usable hash, so a missing account
    // is not distinguishable from a wrong password by response time.
    await scrypt(password, Buffer.alloc(16), 64, params(LOG_N))
    return false
  }
  const expected = Buffer.from(hash, "base64url")
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, params(Number(logN)))
  return timingSafeEqual(actual, expected)
}

const digest = (token: string) => createHash("sha256").update(token).digest("hex")

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url")
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
  // Only the hash is stored, so a database leak does not expose usable session cookies.
  await db()`insert into sessions (token_hash, user_id, expires_at) values (${digest(token)}, ${userId}, ${expires})`
  // Secure whenever the site is served over HTTPS (hosts set x-forwarded-proto);
  // plain-HTTP localhost still works in every browser.
  const https = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim() === "https"
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    expires,
  })
}

/** The signed-in user's id, or null. */
export async function sessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return null
  const rows = await db()<{ user_id: string }[]>`
    select user_id from sessions where token_hash = ${digest(token)} and expires_at > now()`
  return rows[0]?.user_id ?? null
}

export async function destroySession() {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (token) await db()`delete from sessions where token_hash = ${digest(token)}`
  store.delete(COOKIE)
}
