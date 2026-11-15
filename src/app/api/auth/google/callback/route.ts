import { unstable_rethrow } from "next/navigation"

import { findOrCreateGoogleUser } from "@/server/accounts"
import { createSession } from "@/server/auth"
import { finishGoogleSignIn, googleConfig, GoogleSignInError, rememberGoogleLink, siteOrigin } from "@/server/google"
import { withDatabaseTurn } from "@/server/http"

/** Where Google returns the browser. Signs the user in, then moves on to a page of the app. */
export async function GET(request: Request) {
  const to = (path: string) => Response.redirect(`${siteOrigin(request)}${path}`, 302)
  const config = googleConfig()
  if (!config) return to("/login?error=google_setup")
  // "access_denied" and friends: the visitor backed out on Google's side.
  if (new URL(request.url).searchParams.get("error")) return to("/login?error=google_cancelled")
  try {
    const { profile, next } = await finishGoogleSignIn(request, config)
    const result = await withDatabaseTurn(async () => {
      const found = await findOrCreateGoogleUser(profile)
      if ("userId" in found) await createSession(found.userId)
      return found
    })
    if ("needsPassword" in result) {
      await rememberGoogleLink(profile, config.clientSecret)
      return to(`/login?google=link${next ? `&next=${encodeURIComponent(next)}` : ""}`)
    }
    return to(result.isNew ? "/onboarding" : (next ?? "/browse"))
  } catch (err) {
    unstable_rethrow(err)
    if (err instanceof GoogleSignInError) return to(`/login?error=${err.reason}`)
    console.error("[google] sign-in failed:", err)
    return to("/login?error=google_failed")
  }
}
