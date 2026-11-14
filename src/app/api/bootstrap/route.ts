import type { Bootstrap } from "@/lib/types"
import { getAccount } from "@/server/accounts"
import { getActivity } from "@/server/activity"
import { sessionUserId } from "@/server/auth"
import { json, route } from "@/server/http"
import { listListings, ownersOf } from "@/server/listings"

/** One request for everything the app shell needs: who you are, what's listed, and your activity. */
export const GET = route(async () => {
  const userId = await sessionUserId()
  const [account, listings, activity] = await Promise.all([userId ? getAccount(userId) : null, listListings(userId), getActivity(userId)])
  const data: Bootstrap = { account, listings, people: await ownersOf(listings), activity }
  return json(data)
})
