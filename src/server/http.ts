import { unstable_rethrow } from "next/navigation"
import { ZodError } from "zod"

import { sessionUserId } from "./auth"
import { ConfigError } from "./db"

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status })

/**
 * Rejects cross-site writes. The session cookie is SameSite=Lax, and browsers
 * attach Origin to every state-changing request, so a mismatch means the
 * request did not come from our own pages.
 */
function assertSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Cross-site request blocked.")
  const origin = request.headers.get("origin")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (origin && host && new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked.")
}

export async function requireUser() {
  const id = await sessionUserId()
  if (!id) throw new HttpError(401, "Please log in to continue.")
  return id
}

export async function body(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, "Request body must be JSON.")
  }
}

/** Wraps a route handler with the origin check and uniform error responses. */
export function route<Ctx>(handler: (request: Request, ctx: Ctx) => Promise<Response>) {
  return async (request: Request, ctx: Ctx) => {
    try {
      assertSameOrigin(request)
      return await handler(request, ctx)
    } catch (err) {
      // Let Next.js handle its own control-flow errors (e.g. bailing out of prerendering).
      unstable_rethrow(err)
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      if (err instanceof ZodError) {
        const issue = err.issues[0]
        const field = issue?.path.join(".")
        return json({ error: field ? `${field}: ${issue!.message}` : (issue?.message ?? "Invalid request.") }, 400)
      }
      const code = (err as { code?: string }).code ?? ""
      if (err instanceof ConfigError || ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "CONNECT_TIMEOUT", "28P01", "3D000"].includes(code)) {
        console.error("[api] database unavailable:", (err as Error).message)
        return json({ error: "The database isn't reachable. Check DATABASE_URL and run `npm run db:setup`." }, 503)
      }
      if (code === "42P01") {
        console.error("[api] tables missing:", (err as Error).message)
        return json({ error: "The database tables don't exist yet. Run `npm run db:setup`." }, 503)
      }
      console.error("[api] unexpected error:", err)
      return json({ error: "Something went wrong on our side." }, 500)
    }
  }
}
