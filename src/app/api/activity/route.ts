import { actionInput, getActivity, perform } from "@/server/activity"
import { sessionUserId } from "@/server/auth"
import { body, json, requireUser, route } from "@/server/http"

/** The signed-in user's rentals, requests, messages and notifications. Polled by the app. */
export const GET = route(async () => json(await getActivity(await sessionUserId())))

/** Performs one action (send a message, accept a request, …) and returns the updated activity. */
export const POST = route(async (request) => {
  const userId = await requireUser()
  await perform(userId, actionInput.parse(await body(request)))
  return json(await getActivity(userId))
})
