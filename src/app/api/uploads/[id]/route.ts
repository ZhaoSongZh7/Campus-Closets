import { getUpload } from "@/server/activity"
import { json, requireUser, route } from "@/server/http"

/** A message image or pickup/return photo. Only the two people involved can load it. */
export const GET = route<RouteContext<"/api/uploads/[id]">>(async (_request, ctx) => {
  const userId = await requireUser()
  const { id } = await ctx.params
  const upload = await getUpload(userId, id)
  if (!upload) return json({ error: "Photo not found." }, 404)
  return new Response(new Uint8Array(upload.data), {
    headers: {
      "Content-Type": upload.content_type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
})
