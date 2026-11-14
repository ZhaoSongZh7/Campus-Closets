import { randomUUID } from "node:crypto"
import { z } from "zod"

import type { ApiListing, Person, PhotoKey } from "@/lib/types"

import { db } from "./db"
import { HttpError } from "./http"

type PhotoRef = { id: string; kind: "gallery" | PhotoKey }
type ListingRow = {
  id: string
  owner_id: string
  title: string
  category: string
  brand: string
  color: string
  size: string
  size_group: string
  size_note: string
  fit: string
  description: string
  occasions: string[]
  styles: string[]
  price_per_day: string
  min_days: number
  deposit: string
  cleaning_fee: string
  cleaning_included: boolean
  try_on: boolean
  distance_mi: string | null
  rating: string
  review_count: number
  rentals: number
  status: ApiListing["status"]
  pickup_area: string
  handoff: string[]
  days: string[]
  care_notes: string
  created_at: Date
  photos: PhotoRef[]
}

const PHOTO_URL = /^\/api\/photos\/([0-9a-f-]{36})$/
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
const MAX_PHOTO_BYTES = 600_000
const CONDITION_KEYS: PhotoKey[] = ["front", "back", "label", "wear"]
const photoUrl = (id: string) => `/api/photos/${id}`

function toListing(row: ListingRow): ApiListing {
  const condition: ApiListing["condition"] = {}
  for (const p of row.photos) if (p.kind !== "gallery") condition[p.kind] = photoUrl(p.id)
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    category: row.category,
    brand: row.brand,
    color: row.color,
    size: row.size,
    sizeGroup: row.size_group,
    sizeNote: row.size_note,
    fit: row.fit,
    description: row.description,
    occasions: row.occasions,
    styles: row.styles,
    pricePerDay: Number(row.price_per_day),
    minDays: row.min_days,
    deposit: Number(row.deposit),
    cleaningFee: Number(row.cleaning_fee),
    cleaningIncluded: row.cleaning_included,
    tryOn: row.try_on,
    distance: row.distance_mi === null ? null : Number(row.distance_mi),
    rating: Number(row.rating),
    reviewCount: row.review_count,
    rentals: row.rentals,
    photos: row.photos.filter((p) => p.kind === "gallery").map((p) => photoUrl(p.id)),
    condition,
    status: row.status,
    pickupArea: row.pickup_area,
    handoff: row.handoff,
    days: row.days,
    careNotes: row.care_notes,
    createdAt: row.created_at.toISOString().slice(0, 10),
  }
}

const photo = z.string().max(900_000)
const money = z.number().min(0).max(10_000)
const tags = z.array(z.string().max(40)).max(20)

/** What an owner may set. Rating, rentals and distance are never client-controlled. */
export const listingInput = z.object({
  title: z.string().trim().min(1, "Give the item a title.").max(60),
  category: z.string().max(40),
  brand: z.string().trim().max(60),
  color: z.string().max(40),
  size: z.string().max(10),
  sizeGroup: z.string().max(5),
  sizeNote: z.string().max(80),
  fit: z.string().trim().max(80),
  description: z.string().max(2000),
  occasions: tags,
  styles: tags,
  pricePerDay: money,
  minDays: z.number().int().min(1).max(30),
  deposit: money,
  cleaningFee: money,
  cleaningIncluded: z.boolean(),
  tryOn: z.boolean(),
  status: z.enum(["listed", "paused", "draft"]),
  pickupArea: z.string().trim().max(80),
  handoff: tags,
  days: tags,
  careNotes: z.string().max(1000),
  photos: z.array(photo).max(8),
  condition: z.object({ front: photo, back: photo, label: photo, wear: photo }).partial(),
})
export type ListingInput = z.infer<typeof listingInput>

const WITH_PHOTOS = (sql: ReturnType<typeof db>) => sql`
  coalesce((
    select json_agg(json_build_object('id', p.id, 'kind', p.kind) order by p.position, p.created_at)
    from listing_photos p where p.listing_id = l.id
  ), '[]'::json) as photos`

/** Listed items for everyone, plus the viewer's own paused items and drafts. */
export async function listListings(viewerId: string | null): Promise<ApiListing[]> {
  const sql = db()
  const rows = await sql<ListingRow[]>`
    select l.*, ${WITH_PHOTOS(sql)}
    from listings l
    where l.status = 'listed' or l.owner_id = ${viewerId}
    order by l.created_at desc, l.id`
  return rows.map(toListing)
}

async function getListing(id: string): Promise<ApiListing | null> {
  const sql = db()
  const rows = await sql<ListingRow[]>`select l.*, ${WITH_PHOTOS(sql)} from listings l where l.id = ${id}`
  return rows[0] ? toListing(rows[0]) : null
}

/** Public profiles for the owners of the given listings. No contact details. */
export async function ownersOf(listings: ApiListing[]): Promise<Person[]> {
  const ids = [...new Set(listings.map((l) => l.ownerId))]
  if (!ids.length) return []
  const users = await db()<
    {
      id: string
      first_name: string
      last_name: string
      zip: string
      id_verified: boolean
      is_sample: boolean
      sample_rentals: number
      sample_rating: string
      reply_time: string
      created_at: Date
    }[]
  >`select id, first_name, last_name, zip, id_verified, is_sample, sample_rentals, sample_rating, reply_time, created_at
    from users where id in ${db()(ids)}`
  return users.map((u) => {
    const theirs = listings.filter((l) => l.ownerId === u.id && l.status === "listed")
    const reviews = theirs.reduce((n, l) => n + l.reviewCount, 0)
    // Real members show first name + last initial; sample lenders keep their full sample name.
    const name = u.is_sample ? `${u.first_name} ${u.last_name}`.trim() : `${u.first_name} ${u.last_name.slice(0, 1)}`.trim() + (u.last_name ? "." : "")
    return {
      id: u.id,
      name,
      initials: `${u.first_name.slice(0, 1)}${u.last_name.slice(0, 1)}`.toUpperCase(),
      verified: u.id_verified,
      rentals: u.is_sample ? u.sample_rentals : theirs.reduce((n, l) => n + l.rentals, 0),
      rating: u.is_sample
        ? Number(u.sample_rating)
        : reviews
          ? Math.round((theirs.reduce((n, l) => n + l.rating * l.reviewCount, 0) / reviews) * 10) / 10
          : 0,
      replyTime: u.reply_time,
      memberSince: u.created_at.getFullYear(),
      neighborhood: u.zip,
    }
  })
}

function decode(dataUrl: string) {
  const match = DATA_URL.exec(dataUrl)
  if (!match) throw new HttpError(400, "Photos must be JPEG, PNG or WebP images.")
  const data = Buffer.from(match[2]!, "base64")
  if (data.length > MAX_PHOTO_BYTES) throw new HttpError(413, "One of the photos is too large.")
  return { contentType: match[1]!, data }
}

/** Creates the listing when `id` is null, otherwise updates it if `ownerId` owns it. */
export async function saveListing(ownerId: string, id: string | null, input: ListingInput): Promise<ApiListing> {
  const sql = db()
  const listingId = id ?? `l_${randomUUID()}`
  const columns = {
    title: input.title,
    category: input.category,
    brand: input.brand,
    color: input.color,
    size: input.size,
    size_group: input.sizeGroup,
    size_note: input.sizeNote,
    fit: input.fit,
    description: input.description,
    occasions: sql.json(input.occasions),
    styles: sql.json(input.styles),
    price_per_day: input.pricePerDay,
    min_days: input.minDays,
    deposit: input.deposit,
    cleaning_fee: input.cleaningFee,
    cleaning_included: input.cleaningIncluded,
    try_on: input.tryOn,
    status: input.status,
    pickup_area: input.pickupArea,
    handoff: sql.json(input.handoff),
    days: sql.json(input.days),
    care_notes: input.careNotes,
  }

  await sql.begin(async (tx) => {
    if (id) {
      const updated = await tx`
        update listings set ${tx(columns)}, updated_at = now()
        where id = ${id} and owner_id = ${ownerId} returning id`
      if (!updated.length) throw new HttpError(404, "Listing not found.")
    } else {
      await tx`insert into listings ${tx({ id: listingId, owner_id: ownerId, ...columns })}`
    }

    // Photos arrive either as a URL we issued (keep it) or as a new data URL (store it).
    const existing = await tx<{ id: string }[]>`select id from listing_photos where listing_id = ${listingId}`
    const mine = new Set(existing.map((p) => p.id))
    const wanted: { kind: string; position: number; value: string }[] = [
      ...input.photos.map((value, position) => ({ kind: "gallery", position, value })),
      ...CONDITION_KEYS.flatMap((kind) => (input.condition[kind] ? [{ kind, position: 0, value: input.condition[kind]! }] : [])),
    ]
    const kept = new Set<string>()
    for (const p of wanted) {
      const existingId = PHOTO_URL.exec(p.value)?.[1]
      if (existingId) {
        if (!mine.has(existingId)) throw new HttpError(400, "That photo doesn't belong to this listing.")
        kept.add(existingId)
        await tx`update listing_photos set kind = ${p.kind}, position = ${p.position} where id = ${existingId}`
      } else {
        const { contentType, data } = decode(p.value)
        await tx`
          insert into listing_photos (id, listing_id, kind, position, content_type, data)
          values (${randomUUID()}, ${listingId}, ${p.kind}, ${p.position}, ${contentType}, ${data})`
      }
    }
    const removed = existing.map((p) => p.id).filter((photoId) => !kept.has(photoId))
    if (removed.length) await tx`delete from listing_photos where id in ${tx(removed)}`
  })

  return (await getListing(listingId))!
}

export async function deleteListing(ownerId: string, id: string) {
  // Deleting a listing removes its requests and conversations too, so don't allow it mid-rental.
  const open = await db()`
    select 1 from bookings b join listings l on l.id = b.listing_id
    where b.listing_id = ${id} and l.owner_id = ${ownerId} and b.status in ('requested', 'confirmed', 'active') limit 1`
  if (open.length) throw new HttpError(409, "This outfit has open requests or rentals. Pause it instead, or finish those first.")
  const rows = await db()`delete from listings where id = ${id} and owner_id = ${ownerId} returning id`
  if (!rows.length) throw new HttpError(404, "Listing not found.")
}

export async function getPhoto(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const rows = await db()<{ content_type: string; data: Buffer }[]>`
    select content_type, data from listing_photos where id = ${id}`
  return rows[0] ?? null
}
