import { z } from "zod"

import { placeFromCoords, placeFromText } from "@/server/geo"
import { body, json, route } from "@/server/http"

const input = z.union([
  z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict(),
  z.object({ text: z.string().trim().min(1).max(80) }).strict(),
])

/**
 * Turns a device position or a typed "ZIP" / "City, ST" into a place: a label and
 * the centre of that ZIP code area. POST, so coordinates never sit in a URL. The
 * position is not stored. `place` is null when it can't be matched.
 */
export const POST = route(async (request) => {
  const data = input.parse(await body(request))
  return json({ place: "text" in data ? placeFromText(data.text) : placeFromCoords(data) })
})
