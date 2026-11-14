import type { Bootstrap } from "@/lib/types"
import { getAccount } from "@/server/accounts"
import { getActivity } from "@/server/activity"
import { sessionUserId } from "@/server/auth"
import { json, route } from "@/server/http"
import { listListings, ownersOf } from "@/server/listings"

/** One request for everything the app shell needs: who you are, what's listed, and your activity. */
export const GET = route(async () => {
  const userId = await sessionUserId()
  // One query at a time (see DB_CONNECTIONS in server/db.ts).
  const account = userId ? await getAccount(userId) : null
  const listings = await listListings(userId)
  const activity = await getActivity(userId)
  const data: Bootstrap = { account, listings, people: await ownersOf(listings), activity }
  return json(data)
})
