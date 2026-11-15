import { codes, lookupByName, type ZipCode } from "zipcodes"

import { milesBetween } from "@/lib/format"
import type { Geo, Place } from "@/lib/types"

/**
 * Places, worked out from a bundled table of US ZIP codes and Canadian postal
 * areas. Nothing here calls another service, and a place is always the centre
 * of a ZIP code area: a device's exact position is used once to find the
 * nearest one and is never stored or returned.
 */

/** A device further than this from every known ZIP code is outside the covered area. */
const MAX_MILES_TO_ZIP = 40
const RAD = Math.PI / 180

// Left out: entries with no coordinates, military post offices abroad (AA/AE/AP), and
// the odd entry whose longitude has lost its minus sign and so lands in Asia.
const MILITARY = new Set(["AA", "AE", "AP"])
const ACROSS_THE_DATE_LINE = new Set(["GU", "MP", "FM", "MH", "PW", "HI"])
const known = new Set(
  Object.values(codes).filter(
    (c) =>
      Number.isFinite(c.latitude) &&
      Number.isFinite(c.longitude) &&
      (c.latitude !== 0 || c.longitude !== 0) &&
      !MILITARY.has(c.state) &&
      (c.longitude < 0 || ACROSS_THE_DATE_LINE.has(c.state))
  )
)

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Canadian areas carry a list of neighbourhoods in brackets; keep the name in front. */
const cityName = (c: ZipCode) => c.city.replace(/\s*\(.*$/, "").trim()
const toPlace = (c: ZipCode): Place => ({ label: `${cityName(c)}, ${c.state} ${c.zip}`.slice(0, 60), lat: c.latitude, lng: c.longitude })

/** The ZIP code area a device is in, or null outside the US and Canada. */
export function placeFromCoords(at: Geo): Place | null {
  let best: ZipCode | null = null
  let bestScore = Infinity
  const shrink = Math.cos(at.lat * RAD)
  for (const c of known) {
    // Flat-map distance is enough to rank candidates.
    const score = (c.latitude - at.lat) ** 2 + ((c.longitude - at.lng) * shrink) ** 2
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  if (!best || milesBetween(at, { lat: best.latitude, lng: best.longitude }) > MAX_MILES_TO_ZIP) return null
  return toPlace(best)
}

function fromCity(city: string, state: string): Place | null {
  let matches: ZipCode[] = []
  try {
    matches = lookupByName(city.trim(), state.trim()).filter((c) => known.has(c))
  } catch {
    return null
  }
  const first = matches[0]
  if (!first) return null
  // A city with several ZIP codes sits at the middle of them.
  const lat = median(matches.map((c) => c.latitude))
  const lng = median(matches.map((c) => c.longitude))
  return { label: `${cityName(first)}, ${first.state}`, lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4 }
}

function resolve(text: string): Place | null {
  const us = /(?:^|\D)(\d{5})(?:-\d{4})?(?:\D|$)/.exec(text)
  const usCode = us && codes[us[1]!]
  if (usCode && known.has(usCode)) return toPlace(usCode)
  const ca = /(?:^|[^A-Za-z0-9])([A-Za-z]\d[A-Za-z])(?:\s?\d[A-Za-z]\d)?(?:[^A-Za-z0-9]|$)/.exec(text)
  const caCode = ca && codes[ca[1]!.toUpperCase()]
  if (caCode && known.has(caCode)) return toPlace(caCode)
  // "Princeton, NJ" or "Princeton NJ"
  const named = /^([^,]+),\s*([A-Za-z][A-Za-z .]*)$/.exec(text) ?? /^(.+?)\s+([A-Za-z]{2})$/.exec(text)
  return named ? fromCity(named[1]!, named[2]!) : null
}

const cache = new Map<string, Place | null>()

/** The place a typed "ZIP" or "City, ST" refers to, or null when it can't be told (e.g. a bare neighbourhood name). */
export function placeFromText(text: string): Place | null {
  const key = text.trim().toLowerCase()
  if (!key) return null
  if (cache.has(key)) return cache.get(key)!
  const place = resolve(text.trim())
  if (cache.size > 5000) cache.clear()
  cache.set(key, place)
  return place
}

export function geoFromText(text: string): Geo | null {
  const place = placeFromText(text)
  return place && { lat: place.lat, lng: place.lng }
}
