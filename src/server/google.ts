import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

import type { GoogleProfile } from "./accounts"
import { servedOverHttps } from "./auth"

/**
 * "Continue with Google": the OpenID Connect authorization-code flow with PKCE.
 *
 *   /api/auth/google           → remembers a one-time state in a cookie, sends the browser to Google
 *   /api/auth/google/callback  → checks the state, swaps the code for an ID token, signs the user in
 *
 * Nothing here runs unless GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"]
const FLOW_COOKIE = "cc_google_flow"
const LINK_COOKIE = "cc_google_link"
const FLOW_MINUTES = 10
const LINK_MINUTES = 15

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/** The address the browser used to reach the site, e.g. "http://localhost:3000". */
export function siteOrigin(request: Request) {
  const url = new URL(request.url)
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "")
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host
  return `${proto}://${host}`
}

/** This must be listed under "Authorized redirect URIs" on the Google OAuth client. */
export const redirectUri = (request: Request) => `${siteOrigin(request)}/api/auth/google/callback`

/** Only paths on this site may be returned to after signing in. */
export const safeNext = (next: string | null | undefined) => (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null)

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

type Flow = { state: string; verifier: string; nonce: string; next: string | null }

/** Starts a sign-in: returns the Google URL to send the browser to. */
export async function beginGoogleSignIn(request: Request, clientId: string, next: string | null) {
  const flow: Flow = {
    state: randomBytes(24).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
    next,
  }
  ;(await cookies()).set(FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString("base64url"), {
    httpOnly: true,
    // Lax, so the cookie comes back when Google returns the browser here.
    sameSite: "lax",
    secure: await servedOverHttps(),
    path: "/api/auth/google",
    maxAge: FLOW_MINUTES * 60,
  })
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString()
  return url.toString()
}

/** Reads the sign-in this browser started and forgets it: each one can be finished once. */
async function takeFlow(): Promise<Flow | null> {
  const store = await cookies()
  const raw = store.get(FLOW_COOKIE)?.value
  store.set(FLOW_COOKIE, "", { path: "/api/auth/google", maxAge: 0 })
  if (!raw) return null
  try {
    const flow = JSON.parse(Buffer.from(raw, "base64url").toString()) as Partial<Flow>
    if (typeof flow.state !== "string" || typeof flow.verifier !== "string" || typeof flow.nonce !== "string") return null
    return { state: flow.state, verifier: flow.verifier, nonce: flow.nonce, next: safeNext(flow.next) }
  } catch {
    return null
  }
}

export class GoogleSignInError extends Error {
  constructor(public reason: "google_failed" | "google_unverified") {
    super(reason)
  }
}

/**
 * Finishes a sign-in: checks that Google is answering the request this browser
 * made, then asks Google who signed in.
 */
export async function finishGoogleSignIn(
  request: Request,
  config: { clientId: string; clientSecret: string }
): Promise<{ profile: GoogleProfile; next: string | null }> {
  const params = new URL(request.url).searchParams
  const flow = await takeFlow()
  const code = params.get("code")
  const state = params.get("state")
  if (!flow || !code || !state || !sameText(state, flow.state)) throw new GoogleSignInError("google_failed")

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri(request),
      code_verifier: flow.verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  const tokens = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string }
  if (!res.ok || !tokens.id_token) {
    console.error("[google] token exchange failed:", res.status, tokens.error ?? "", tokens.error_description ?? "")
    throw new GoogleSignInError("google_failed")
  }

  // The ID token came straight from Google's token endpoint over TLS, which is what
  // vouches for it (OpenID Connect Core §3.1.3.7), so its claims are checked, not its signature.
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString()) as Record<string, unknown>
  } catch {
    throw new GoogleSignInError("google_failed")
  }
  const text = (key: string) => (typeof claims[key] === "string" ? (claims[key] as string).trim() : "")
  const valid =
    ISSUERS.includes(text("iss")) &&
    claims.aud === config.clientId &&
    typeof claims.exp === "number" &&
    claims.exp * 1000 > Date.now() &&
    sameText(text("nonce"), flow.nonce) &&
    text("sub") !== ""
  if (!valid) throw new GoogleSignInError("google_failed")
  const email = text("email").toLowerCase()
  if (!email || email.length > 254 || (claims.email_verified !== true && claims.email_verified !== "true")) throw new GoogleSignInError("google_unverified")

  const [given, ...rest] = (text("given_name") || text("name") || email.split("@")[0]!).split(/\s+/)
  return {
    profile: {
      sub: text("sub"),
      email,
      firstName: (given || "Member").slice(0, 60),
      lastName: (text("family_name") || (text("given_name") ? "" : rest.join(" "))).slice(0, 60),
    },
    next: flow.next,
  }
}

// ---------- connecting Google to an account that already has a password ----------

const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("base64url")

/**
 * Remembers, in a signed cookie, that this browser just proved it controls a Google
 * account whose email already has a password account. Logging in with that password
 * within a few minutes connects the two.
 */
export async function rememberGoogleLink(profile: GoogleProfile, clientSecret: string) {
  const payload = Buffer.from(JSON.stringify({ sub: profile.sub, email: profile.email, exp: Date.now() + LINK_MINUTES * 60_000 })).toString("base64url")
  ;(await cookies()).set(LINK_COOKIE, `${payload}.${sign(clientSecret, payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: await servedOverHttps(),
    path: "/",
    maxAge: LINK_MINUTES * 60,
  })
}

/** The Google id waiting to be connected to the account with this email, if this browser has one. Used once. */
export async function takeGoogleLink(email: string): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(LINK_COOKIE)?.value
  if (!raw) return null
  store.set(LINK_COOKIE, "", { path: "/", maxAge: 0 })
  const config = googleConfig()
  const [payload, signature] = raw.split(".")
  if (!config || !payload || !signature || !sameText(signature, sign(config.clientSecret, payload))) return null
  try {
    const link = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: unknown; email?: unknown; exp?: unknown }
    if (typeof link.sub !== "string" || typeof link.email !== "string" || typeof link.exp !== "number") return null
    return link.exp > Date.now() && link.email === email.toLowerCase() ? link.sub : null
  } catch {
    return null
  }
}
