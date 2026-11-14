import { body, json, requireUser, route } from "@/server/http"
import { listingInput, saveListing } from "@/server/listings"

export const POST = route(async (request) => {
  const userId = await requireUser()
  return json({ listing: await saveListing(userId, null, listingInput.parse(await body(request))) }, 201)
})
