import { body, json, requireUser, route } from "@/server/http"
import { deleteListing, listingInput, saveListing } from "@/server/listings"

type Ctx = RouteContext<"/api/listings/[id]">

export const PUT = route<Ctx>(async (request, ctx) => {
  const userId = await requireUser()
  const { id } = await ctx.params
  return json({ listing: await saveListing(userId, id, listingInput.parse(await body(request))) })
})

export const DELETE = route<Ctx>(async (_request, ctx) => {
  const userId = await requireUser()
  const { id } = await ctx.params
  await deleteListing(userId, id)
  return json({ ok: true })
})
