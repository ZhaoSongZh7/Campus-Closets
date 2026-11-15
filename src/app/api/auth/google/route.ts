import { beginGoogleSignIn, googleConfig, safeNext, siteOrigin } from "@/server/google"

/** Sends the browser to Google to pick an account. `?next=/path` is where to land afterwards. */
export async function GET(request: Request) {
  const config = googleConfig()
  if (!config) return Response.redirect(`${siteOrigin(request)}/login?error=google_setup`, 302)
  const next = safeNext(new URL(request.url).searchParams.get("next"))
  return Response.redirect(await beginGoogleSignIn(request, config.clientId, next), 302)
}
