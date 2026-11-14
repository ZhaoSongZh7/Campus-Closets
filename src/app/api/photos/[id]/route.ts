import { json, route } from "@/server/http"
import { getPhoto } from "@/server/listings"

export const GET = route<RouteContext<"/api/photos/[id]">>(async (_request, ctx) => {
  const { id } = await ctx.params
  const photo = await getPhoto(id)
  if (!photo) return json({ error: "Photo not found." }, 404)
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.content_type,
      // A photo id never changes content; replacing a photo creates a new id.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
})
