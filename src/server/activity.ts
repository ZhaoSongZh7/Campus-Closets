import { randomInt, randomUUID } from "node:crypto"
import type postgres from "postgres"
import { z } from "zod"

import { addDaysISO, fmt, lenderEarn, overlaps, quote, rentalDays } from "@/lib/format"
import type { Activity, LenderRequest, Message, Person, PhotoSet, Rental, Review, Thread, Transaction, TryOn } from "@/lib/types"

import { db } from "./db"
import { HttpError } from "./http"

/**
 * Everything users do with each other: saved outfits, try-on and reservation
 * requests, the rental itself, messages, notifications and reviews.
 *
 * A try-on or reservation is one `bookings` row that both people see. The
 * client still thinks in "my rentals" / "requests for my listings", so
 * `getActivity` projects each row into the shape that side of the UI expects.
 */

type Q = postgres.Sql | postgres.TransactionSql

// How long a sample lender takes to accept, and how soon a sample renter asks for a new listing.
const SAMPLE_ACCEPT_AFTER = "12 seconds"
const SAMPLE_DEMAND_AFTER = "15 seconds"
const SAMPLE_REPLY_AFTER = "2500 milliseconds"
const SAMPLE_RENTERS = ["r1", "r2", "r3", "r4"]
const SAMPLE_NOTES = [
  "Hi! I'd love to borrow this for an event next week. Is the pickup time flexible?",
  "This looks perfect. I'm usually this size but would like to check the fit first.",
  "Is this still available? I can meet at a public spot nearby.",
  "I rented something similar last spring and loved it. Hoping these dates work!",
]
const SAMPLE_REPLIES = [
  "Sounds good — thanks for letting me know!",
  "That works for me. See you then.",
  "Got it. I'll have everything ready.",
  "Perfect, thank you!",
]

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
const MAX_PHOTO_BYTES = 600_000
const uploadUrl = (id: string) => `/api/uploads/${id}`
const PLACE_LABEL = { public: "Public spot", home: "Lender's home", other: "Another spot" } as const
const OPEN = ["requested", "confirmed", "active"]

// ---------- rows ----------

type UserRow = {
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
  rentals: number
  rating: string | null
}

type BookingRow = {
  id: string
  kind: "reservation" | "tryon"
  listing_id: string
  renter_id: string
  lender_id: string
  status: "requested" | "confirmed" | "active" | "returned" | "completed" | "cancelled" | "declined"
  start_date: string
  end_date: string | null
  event_date: string | null
  pickup_time: string
  return_time: string
  place: "public" | "home" | "other"
  note: string
  code: string
  handoff_code: string
  days: number
  subtotal: string
  cleaning_fee: string
  service_fee: string
  total: string
  deposit: string
  tried_on: string | null
  pickup_checklist: boolean[]
  return_checklist: boolean[]
  reviewed: boolean
  payout: "pending" | "available" | "paid" | null
  created_at: Date
  responded_at: Date | null
  returned_at: Date | null
  listing_title: string
  photos: { id: string; phase: "pickup" | "return"; slot: keyof PhotoSet }[]
}

type ThreadRow = {
  id: string
  listing_id: string
  renter_id: string
  lender_id: string
  context: string
  renter_read_at: Date
  lender_read_at: Date
  messages: { id: string; sender: string | null; system: boolean; icon: Message["icon"] | null; text: string; upload: string | null; at: number }[]
}

type ListingRow = {
  id: string
  owner_id: string
  title: string
  status: string
  price_per_day: string
  min_days: number
  deposit: string
  cleaning_fee: string
  try_on: boolean
  owner_sample: boolean
}

// ---------- people ----------

const firstName = (name: string) => name.split(" ")[0] ?? name

function toPerson(u: UserRow): Person {
  // Real members show first name + last initial; sample people keep their full sample name.
  const name = u.is_sample ? `${u.first_name} ${u.last_name}`.trim() : `${u.first_name} ${u.last_name.slice(0, 1)}`.trim() + (u.last_name ? "." : "")
  return {
    id: u.id,
    name,
    initials: `${u.first_name.slice(0, 1)}${u.last_name.slice(0, 1)}`.toUpperCase(),
    verified: u.id_verified,
    rentals: u.is_sample ? u.sample_rentals : u.rentals,
    rating: u.is_sample ? Number(u.sample_rating) : Math.round(Number(u.rating ?? 0) * 10) / 10,
    replyTime: u.reply_time,
    memberSince: u.created_at.getFullYear(),
    neighborhood: u.zip,
  }
}

/** Public profiles: no email, phone or full last name. */
async function peopleByIds(q: Q, ids: string[]): Promise<Person[]> {
  const unique = [...new Set(ids)]
  if (!unique.length) return []
  const rows = await q<UserRow[]>`
    select u.id, u.first_name, u.last_name, u.zip, u.id_verified, u.is_sample, u.sample_rentals, u.sample_rating, u.reply_time, u.created_at,
      coalesce((select sum(l.rentals) from listings l where l.owner_id = u.id), 0)::int as rentals,
      (select sum(l.rating * l.review_count) / nullif(sum(l.review_count), 0) from listings l where l.owner_id = u.id) as rating
    from users u where u.id in ${q(unique)}`
  return rows.map(toPerson)
}

async function nameOf(q: Q, userId: string) {
  return (await peopleByIds(q, [userId]))[0]?.name ?? "A member"
}

// ---------- reading ----------

const EMPTY: Omit<Activity, "booked" | "reviews"> = {
  favorites: [],
  rentals: [],
  tryOns: [],
  requests: [],
  transactions: [],
  threads: [],
  notifications: [],
  people: [],
}

function toRental(b: BookingRow): Rental {
  const photos = (phase: "pickup" | "return") => Object.fromEntries(b.photos.filter((p) => p.phase === phase).map((p) => [p.slot, uploadUrl(p.id)])) as PhotoSet
  return {
    id: b.id,
    code: b.code,
    listingId: b.listing_id,
    // A request the lender turned down reads as cancelled on the renter's side.
    status: b.status === "declined" ? "cancelled" : b.status,
    start: b.start_date,
    end: b.end_date ?? b.start_date,
    eventDate: b.event_date ?? undefined,
    pickupTime: b.pickup_time,
    returnTime: b.return_time,
    place: b.place === "home" ? "home" : "public",
    days: b.days,
    subtotal: Number(b.subtotal),
    cleaningFee: Number(b.cleaning_fee),
    serviceFee: Number(b.service_fee),
    total: Number(b.total),
    deposit: Number(b.deposit),
    handoffCode: b.handoff_code,
    pickupChecklist: b.pickup_checklist,
    pickupPhotos: photos("pickup"),
    returnChecklist: b.return_checklist,
    returnPhotos: photos("return"),
    reviewed: b.reviewed,
    triedOn: b.tried_on ?? undefined,
    createdAt: b.created_at.toISOString().slice(0, 10),
  }
}

function toTryOn(b: BookingRow): TryOn {
  const status = b.status === "requested" ? "requested" : b.status === "confirmed" ? "booked" : b.status === "completed" ? "done" : "cancelled"
  return { id: b.id, listingId: b.listing_id, date: b.start_date, time: b.pickup_time, place: b.place, note: b.note, status, createdAt: b.created_at.toISOString().slice(0, 10) }
}

function toRequest(b: BookingRow): LenderRequest {
  const status =
    b.status === "requested" ? "pending" : b.status === "confirmed" || b.status === "active" ? "accepted" : b.status === "declined" || b.status === "cancelled" ? "declined" : "completed"
  return {
    id: b.id,
    kind: b.kind,
    renterId: b.renter_id,
    listingId: b.listing_id,
    start: b.start_date,
    end: b.end_date ?? undefined,
    time: b.pickup_time,
    returnTime: b.return_time || undefined,
    place: PLACE_LABEL[b.place],
    message: b.note,
    status,
    createdAt: b.created_at.getTime(),
    respondedAt: b.responded_at?.getTime(),
  }
}

function toTransaction(b: BookingRow, renterName: string): Transaction {
  const total = Number(b.subtotal)
  return {
    id: `t-${b.id}`,
    date: b.payout === "pending" ? (b.end_date ?? b.start_date) : (b.returned_at ?? b.created_at).toISOString().slice(0, 10),
    listingTitle: b.listing_title,
    renterName,
    total,
    ...lenderEarn(total),
    status: b.payout!,
    requestId: b.id,
  }
}

async function shared(q: Q): Promise<Pick<Activity, "booked" | "reviews">> {
  const [ranges, reviews] = await Promise.all([
    q<{ listing_id: string; start_date: string; end_date: string }[]>`
      select listing_id, start_date, end_date from bookings
      where kind = 'reservation' and status in ('confirmed', 'active') and end_date >= ${addDaysISO(-1)}`,
    q<{ id: string; listing_id: string; author_name: string; context: string; rating: number; text: string; tags: string[] }[]>`
      select id, listing_id, author_name, context, rating, text, tags from reviews order by created_at desc, id limit 300`,
  ])
  const booked: Activity["booked"] = {}
  for (const r of ranges) (booked[r.listing_id] ??= []).push({ start: r.start_date, end: r.end_date })
  return {
    booked,
    reviews: reviews.map(
      (r): Review => ({
        id: r.id,
        listingId: r.listing_id,
        author: r.author_name,
        initials: r.author_name.split(" ").map((w) => w.slice(0, 1)).join("").slice(0, 2).toUpperCase(),
        context: r.context,
        rating: r.rating,
        text: r.text,
        tags: r.tags.length ? r.tags : undefined,
      })
    ),
  }
}

/** What the signed-in user sees of their own activity, plus booked dates and reviews (public). */
export async function getActivity(userId: string | null): Promise<Activity> {
  const sql = db()
  if (!userId) return { ...EMPTY, ...(await shared(sql)) }
  await simulateSamplePeople(userId)

  const [common, favorites, bookings, threads, notifications] = await Promise.all([
    shared(sql),
    sql<{ listing_id: string }[]>`select listing_id from favorites where user_id = ${userId} order by created_at`,
    sql<BookingRow[]>`
      select b.*, l.title as listing_title,
        coalesce((select json_agg(json_build_object('id', u.id, 'phase', u.phase, 'slot', u.slot)) from uploads u where u.booking_id = b.id), '[]'::json) as photos
      from bookings b join listings l on l.id = b.listing_id
      where b.renter_id = ${userId} or b.lender_id = ${userId}
      order by b.created_at desc, b.id`,
    sql<ThreadRow[]>`
      select t.id, t.listing_id, t.renter_id, t.lender_id, t.context, t.renter_read_at, t.lender_read_at,
        coalesce((
          select json_agg(json_build_object('id', m.id, 'sender', m.sender_id, 'system', m.is_system, 'icon', m.icon, 'text', m.text,
                                            'upload', m.upload_id, 'at', floor(extract(epoch from m.created_at) * 1000))
                          order by m.created_at, m.id)
          from messages m where m.thread_id = t.id and m.created_at <= now()
        ), '[]'::json) as messages
      from threads t
      where (t.renter_id = ${userId} or t.lender_id = ${userId})
        -- an empty thread is only visible to the person who opened it
        and (t.created_by = ${userId} or exists (select 1 from messages m where m.thread_id = t.id and m.created_at <= now()))
      order by t.updated_at desc, t.id`,
    sql<{ id: string; text: string; href: string; read: boolean; created_at: Date }[]>`
      select id, text, href, read, created_at from notifications where user_id = ${userId} order by created_at desc, id limit 50`,
  ])

  const others = [
    ...bookings.map((b) => (b.renter_id === userId ? b.lender_id : b.renter_id)),
    ...threads.map((t) => (t.renter_id === userId ? t.lender_id : t.renter_id)),
  ]
  const people = await peopleByIds(sql, others)
  const nameById = new Map(people.map((p) => [p.id, p.name]))

  const mine = bookings.filter((b) => b.renter_id === userId)
  const theirs = bookings.filter((b) => b.lender_id === userId)

  return {
    ...common,
    favorites: favorites.map((f) => f.listing_id),
    rentals: mine.filter((b) => b.kind === "reservation").map(toRental),
    tryOns: mine.filter((b) => b.kind === "tryon").map(toTryOn),
    requests: theirs.map(toRequest),
    transactions: theirs.filter((b) => b.kind === "reservation" && b.payout).map((b) => toTransaction(b, nameById.get(b.renter_id) ?? "Member")),
    threads: threads.map((t): Thread => {
      const renting = t.renter_id === userId
      const other = renting ? t.lender_id : t.renter_id
      const readAt = (renting ? t.renter_read_at : t.lender_read_at).getTime()
      const otherName = firstName(nameById.get(other) ?? "They")
      return {
        id: t.id,
        personId: other,
        listingId: t.listing_id,
        context: t.context,
        role: renting ? "renting" : "lending",
        unread: t.messages.some((m) => m.sender !== userId && m.at > readAt),
        messages: t.messages.map((m) => ({
          id: m.id,
          from: m.system ? "system" : m.sender === userId ? "me" : "them",
          text: m.text.replaceAll("{actor}", m.sender === userId ? "You" : otherName),
          icon: m.icon ?? undefined,
          image: m.upload ? uploadUrl(m.upload) : undefined,
          at: m.at,
        })),
      }
    }),
    notifications: notifications.map((n) => ({ id: n.id, text: n.text, href: n.href, at: n.created_at.getTime(), read: n.read })),
    people,
  }
}

/** A message image or pickup/return photo, if `userId` is one of the two people involved. */
export async function getUpload(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const rows = await db()<{ content_type: string; data: Buffer }[]>`
    select u.content_type, u.data from uploads u
    left join threads t on t.id = u.thread_id
    left join bookings b on b.id = u.booking_id
    where u.id = ${id} and ${userId} in (t.renter_id, t.lender_id, b.renter_id, b.lender_id)`
  return rows[0] ?? null
}

// ---------- writing: shared steps ----------

function decode(dataUrl: string) {
  const match = DATA_URL.exec(dataUrl)
  if (!match) throw new HttpError(400, "Photos must be JPEG, PNG or WebP images.")
  const data = Buffer.from(match[2]!, "base64")
  if (data.length > MAX_PHOTO_BYTES) throw new HttpError(413, "That photo is too large.")
  return { contentType: match[1]!, data }
}

/** Finds or creates the conversation about a listing between its owner and a renter. */
async function threadFor(q: Q, o: { id?: string; listingId: string; renterId: string; lenderId: string; context: string; by: string }) {
  const rows = await q<{ id: string }[]>`
    insert into threads (id, listing_id, renter_id, lender_id, context, created_by)
    values (${o.id ?? `th-${randomUUID()}`}, ${o.listingId}, ${o.renterId}, ${o.lenderId}, ${o.context}, ${o.by})
    on conflict (listing_id, renter_id) do update set context = excluded.context, updated_at = now()
    returning id`
  return rows[0]!.id
}

async function say(
  q: Q,
  threadId: string,
  senderId: string,
  text: string,
  o: { system?: boolean; icon?: Message["icon"]; uploadId?: string; id?: string; after?: string } = {}
) {
  await q`
    insert into messages (id, thread_id, sender_id, is_system, icon, text, upload_id, created_at)
    values (${o.id ?? `m-${randomUUID()}`}, ${threadId}, ${senderId}, ${o.system ?? false}, ${o.icon ?? null}, ${text}, ${o.uploadId ?? null},
            now() + ${o.after ?? "0 seconds"}::interval)`
  await q`update threads set updated_at = now() where id = ${threadId}`
}

/** Records an event in the pair's conversation. "{actor}" in the text is whoever did it. */
async function event(q: Q, b: { listing_id: string; renter_id: string; lender_id: string }, by: string, context: string, text: string, icon: Message["icon"] = "check") {
  const threadId = await threadFor(q, { listingId: b.listing_id, renterId: b.renter_id, lenderId: b.lender_id, context, by })
  await say(q, threadId, by, text, { system: true, icon })
  return threadId
}

async function notify(q: Q, userId: string, text: string, href: string) {
  await q`insert into notifications (id, user_id, text, href) values (${`n-${randomUUID()}`}, ${userId}, ${text}, ${href})`
}

async function listingFor(q: Q, id: string) {
  const rows = await q<ListingRow[]>`
    select l.id, l.owner_id, l.title, l.status, l.price_per_day, l.min_days, l.deposit, l.cleaning_fee, l.try_on, u.is_sample as owner_sample
    from listings l join users u on u.id = l.owner_id where l.id = ${id}`
  if (!rows[0]) throw new HttpError(404, "That outfit is no longer available.")
  return rows[0]
}

/** Locks and returns a booking the user takes part in. */
async function bookingFor(q: Q, id: string, userId: string, side: "renter" | "lender") {
  const rows = await q<BookingRow[]>`
    select b.*, l.title as listing_title, '[]'::json as photos
    from bookings b join listings l on l.id = b.listing_id
    where b.id = ${id} for update of b`
  const b = rows[0]
  if (!b || (side === "renter" ? b.renter_id : b.lender_id) !== userId) throw new HttpError(404, "That request no longer exists.")
  return b
}

async function assertFree(q: Q, listingId: string, start: string, end: string, exceptId = "") {
  const taken = await q<{ start_date: string; end_date: string }[]>`
    select start_date, end_date from bookings
    where listing_id = ${listingId} and kind = 'reservation' and status in ('confirmed', 'active') and id <> ${exceptId}`
  if (taken.some((t) => overlaps(start, end, t.start_date, t.end_date))) throw new HttpError(409, "Those dates are already booked.")
}

/** Marks a reservation as back with the lender: earnings unlock and the listing's rental count goes up. */
async function settleReturn(q: Q, b: BookingRow) {
  await q`update bookings set status = 'returned', returned_at = now(), payout = 'available' where id = ${b.id}`
  await q`update listings set rentals = rentals + 1 where id = ${b.listing_id}`
}

// ---------- writing: sample people ----------

/**
 * Sample lenders and renters are rows in `users` that nobody logs in as. So that
 * a new member can try both sides alone, they act when that member next checks in:
 * sample lenders accept requests, and one sample renter asks for each new listing.
 */
async function simulateSamplePeople(userId: string) {
  const sql = db()
  const [due] = await sql<{ accept: boolean; demand: boolean }[]>`
    select
      exists (select 1 from bookings b join users u on u.id = b.lender_id
              where b.renter_id = ${userId} and b.status = 'requested' and u.is_sample
                and b.created_at < now() - ${SAMPLE_ACCEPT_AFTER}::interval) as accept,
      exists (select 1 from listings l
              where l.owner_id = ${userId} and l.status = 'listed' and l.created_at < now() - ${SAMPLE_DEMAND_AFTER}::interval
                and not exists (select 1 from bookings b where b.listing_id = l.id)) as demand`
  if (!due?.accept && !due?.demand) return

  await sql.begin(async (tx) => {
    // One check-in at a time per member, so two tabs don't both act.
    await tx`select pg_advisory_xact_lock(hashtext(${`sample:${userId}`}))`

    const requests = await tx<BookingRow[]>`
      select b.*, l.title as listing_title, '[]'::json as photos
      from bookings b join listings l on l.id = b.listing_id join users u on u.id = b.lender_id
      where b.renter_id = ${userId} and b.status = 'requested' and u.is_sample
        and b.created_at < now() - ${SAMPLE_ACCEPT_AFTER}::interval
      for update of b`
    for (const b of requests) {
      const lender = await nameOf(tx, b.lender_id)
      if (b.kind === "reservation") {
        await tx`update bookings set status = 'confirmed', payout = 'pending', responded_at = now() where id = ${b.id}`
        const threadId = await event(tx, b, b.lender_id, "Request", "{actor} accepted the reservation")
        await say(tx, threadId, b.lender_id, `You're all set for ${fmt(b.start_date)} at ${b.pickup_time}. See you then!`)
        await notify(tx, userId, `${lender} accepted your reservation for ${b.listing_title}`, `/rentals/${b.id}`)
      } else {
        await tx`update bookings set status = 'confirmed', responded_at = now() where id = ${b.id}`
        const threadId = await event(tx, b, b.lender_id, "Try-on", "{actor} accepted the try-on")
        await say(tx, threadId, b.lender_id, `Happy to meet on ${fmt(b.start_date)} at ${b.pickup_time}. I'll bring the outfit in a garment bag.`)
        await notify(tx, userId, `${lender} confirmed your try-on for ${b.listing_title}`, "/rentals?tab=tryons")
      }
    }

    const listings = await tx<{ id: string; title: string; min_days: number; try_on: boolean; price_per_day: string; cleaning_fee: string; deposit: string }[]>`
      select l.id, l.title, l.min_days, l.try_on, l.price_per_day, l.cleaning_fee, l.deposit from listings l
      where l.owner_id = ${userId} and l.status = 'listed' and l.created_at < now() - ${SAMPLE_DEMAND_AFTER}::interval
        and not exists (select 1 from bookings b where b.listing_id = l.id)
      order by l.created_at`
    if (!listings.length) return
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from bookings where lender_id = ${userId}`
    for (const [i, l] of listings.entries()) {
      const count = n + i
      const renterId = SAMPLE_RENTERS[count % SAMPLE_RENTERS.length]!
      const renter = await nameOf(tx, renterId)
      const note = SAMPLE_NOTES[count % SAMPLE_NOTES.length]!
      // Alternate reservations and try-ons so both kinds of request can be handled.
      const tryOn = l.try_on && count % 2 === 1
      const pair = { listing_id: l.id, renter_id: renterId, lender_id: userId }
      const id = `${tryOn ? "to" : "rn"}-${randomUUID()}`
      if (tryOn) {
        const date = addDaysISO(2)
        await tx`
          insert into bookings (id, kind, listing_id, renter_id, lender_id, start_date, pickup_time, place, note)
          values (${id}, 'tryon', ${l.id}, ${renterId}, ${userId}, ${date}, '5:30 PM', 'public', ${note})`
        const threadId = await event(tx, pair, renterId, "Try-on", `Try-on requested for ${fmt(date)} · 5:30 PM`, "cal")
        await say(tx, threadId, renterId, note)
      } else {
        const start = addDaysISO(0)
        const end = addDaysISO(Math.max(2, l.min_days))
        const days = rentalDays(start, end)
        const price = quote(Number(l.price_per_day), days, Number(l.cleaning_fee))
        await tx`
          insert into bookings (id, kind, listing_id, renter_id, lender_id, start_date, end_date, pickup_time, return_time, place, note, code, handoff_code,
                                days, subtotal, cleaning_fee, service_fee, total, deposit)
          values (${id}, 'reservation', ${l.id}, ${renterId}, ${userId}, ${start}, ${end}, '5:30 PM', '6:00 PM', 'public', ${note},
                  ${`RSV-${randomInt(1000, 10000)}`}, ${String(randomInt(1000, 10000))},
                  ${days}, ${price.subtotal}, ${price.cleaningFee}, ${price.serviceFee}, ${price.total}, ${Number(l.deposit)})`
        const threadId = await event(tx, pair, renterId, "Request", `Reservation requested for ${fmt(start)} – ${fmt(end)}`, "cal")
        await say(tx, threadId, renterId, note)
      }
      await notify(tx, userId, `${renter} requested ${tryOn ? "a try-on for" : "to reserve"} ${l.title}`, "/lender/requests")
    }
  })
}

// ---------- writing: actions ----------

const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const time = z.string().min(1).max(20)
const checklist = z.array(z.boolean()).length(3)
const image = z.string().max(900_000)

export const actionInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("toggleFavorite"), listingId: z.string().max(80) }),
  z.object({ type: z.literal("requestTryOn"), id, listingId: z.string().max(80), date: day, time, place: z.enum(["public", "home", "other"]), note: z.string().max(1000) }),
  z.object({ type: z.literal("rescheduleTryOn"), id, date: day, time }),
  z.object({
    type: z.literal("createReservation"),
    id,
    listingId: z.string().max(80),
    start: day,
    end: day,
    eventDate: day.optional(),
    pickupTime: time,
    returnTime: time,
    place: z.enum(["public", "home"]),
  }),
  z.object({ type: z.literal("cancelBooking"), id }),
  z.object({ type: z.literal("updateRental"), id, pickupTime: time.optional(), returnTime: time.optional(), pickupChecklist: checklist.optional(), returnChecklist: checklist.optional() }),
  z.object({ type: z.literal("extendRental"), id, extraDays: z.number().int().min(1).max(14) }),
  z.object({ type: z.literal("setRentalPhoto"), id, phase: z.enum(["pickup", "return"]), key: z.enum(["front", "back", "label", "wear"]), data: image.nullable() }),
  z.object({ type: z.literal("confirmPickup"), id }),
  z.object({ type: z.literal("confirmReturn"), id }),
  z.object({ type: z.literal("submitReview"), id, outfit: z.number().int().min(1).max(5), lender: z.number().int().min(1).max(5), tags: z.array(z.string().max(40)).max(10), text: z.string().max(2000) }),
  z.object({ type: z.literal("skipReview"), id }),
  z.object({ type: z.literal("respondRequest"), id, accept: z.boolean() }),
  z.object({ type: z.literal("completeRequest"), id }),
  z.object({ type: z.literal("payOut") }),
  z.object({ type: z.literal("openThread"), id, listingId: z.string().max(80), personId: z.string().max(80), context: z.string().max(40) }),
  z.object({ type: z.literal("sendMessage"), id, threadId: z.string().max(80), text: z.string().max(2000), image: image.optional(), icon: z.enum(["pin"]).optional() }),
  z.object({ type: z.literal("markThreadRead"), threadId: z.string().max(80) }),
  z.object({ type: z.literal("markNotificationsRead") }),
])
export type ActionInput = z.infer<typeof actionInput>

/** Runs one action as `userId`. Every branch checks that the user is the right side of the booking or thread. */
export async function perform(userId: string, a: ActionInput): Promise<void> {
  const sql = db()
  try {
    await sql.begin((tx) => run(tx, userId, a))
  } catch (err) {
    // A client-chosen id that already exists: almost always the same request sent twice.
    if ((err as { code?: string }).code === "23505") throw new HttpError(409, "That was already sent.")
    throw err
  }
}

async function run(tx: Q, me: string, a: ActionInput) {
  switch (a.type) {
    case "toggleFavorite": {
      const removed = await tx`delete from favorites where user_id = ${me} and listing_id = ${a.listingId} returning listing_id`
      if (!removed.length) {
        await listingFor(tx, a.listingId)
        await tx`insert into favorites (user_id, listing_id) values (${me}, ${a.listingId}) on conflict do nothing`
      }
      return
    }

    case "requestTryOn": {
      const l = await listingFor(tx, a.listingId)
      if (l.owner_id === me) throw new HttpError(400, "This is your own listing.")
      if (l.status !== "listed" || !l.try_on) throw new HttpError(409, "This outfit isn't available for try-ons.")
      await tx`
        insert into bookings (id, kind, listing_id, renter_id, lender_id, start_date, pickup_time, place, note)
        values (${a.id}, 'tryon', ${l.id}, ${me}, ${l.owner_id}, ${a.date}, ${a.time}, ${a.place}, ${a.note.trim()})`
      const pair = { listing_id: l.id, renter_id: me, lender_id: l.owner_id }
      const threadId = await event(tx, pair, me, "Try-on", `Try-on requested for ${fmt(a.date)} · ${a.time}`, "cal")
      if (a.note.trim()) await say(tx, threadId, me, a.note.trim())
      await notify(tx, l.owner_id, `${await nameOf(tx, me)} requested a try-on for ${l.title}`, "/lender/requests")
      return
    }

    case "rescheduleTryOn": {
      const b = await bookingFor(tx, a.id, me, "renter")
      if (b.kind !== "tryon" || !["requested", "confirmed"].includes(b.status)) throw new HttpError(409, "This try-on can't be moved any more.")
      await tx`update bookings set start_date = ${a.date}, pickup_time = ${a.time} where id = ${b.id}`
      await event(tx, b, me, "Try-on", `{actor} moved the try-on to ${fmt(a.date)} · ${a.time}`, "cal")
      await notify(tx, b.lender_id, `${await nameOf(tx, me)} moved the try-on for ${b.listing_title} to ${fmt(a.date)} · ${a.time}`, "/lender/requests")
      return
    }

    case "createReservation": {
      const l = await listingFor(tx, a.listingId)
      if (l.owner_id === me) throw new HttpError(400, "This is your own listing.")
      if (l.status !== "listed") throw new HttpError(409, "This outfit isn't available right now.")
      if (a.end <= a.start) throw new HttpError(400, "The return date must be after the pickup date.")
      if (a.start < addDaysISO(-1)) throw new HttpError(400, "The pickup date has already passed.")
      const days = rentalDays(a.start, a.end)
      if (days < l.min_days) throw new HttpError(400, `This outfit rents for at least ${l.min_days} day${l.min_days === 1 ? "" : "s"}.`)
      await assertFree(tx, l.id, a.start, a.end)
      const price = quote(Number(l.price_per_day), days, Number(l.cleaning_fee))
      const [tried] = await tx<{ start_date: string }[]>`
        select start_date from bookings
        where listing_id = ${l.id} and renter_id = ${me} and kind = 'tryon' and status in ('requested', 'confirmed', 'completed')
        order by created_at desc limit 1`
      await tx`
        insert into bookings (id, kind, listing_id, renter_id, lender_id, start_date, end_date, event_date, pickup_time, return_time, place, code, handoff_code,
                              days, subtotal, cleaning_fee, service_fee, total, deposit, tried_on)
        values (${a.id}, 'reservation', ${l.id}, ${me}, ${l.owner_id}, ${a.start}, ${a.end}, ${a.eventDate ?? null}, ${a.pickupTime}, ${a.returnTime}, ${a.place},
                ${`RSV-${randomInt(1000, 10000)}`}, ${String(randomInt(1000, 10000))},
                ${days}, ${price.subtotal}, ${price.cleaningFee}, ${price.serviceFee}, ${price.total}, ${Number(l.deposit)}, ${tried?.start_date ?? null})`
      await event(tx, { listing_id: l.id, renter_id: me, lender_id: l.owner_id }, me, "Request", `Reservation requested for ${fmt(a.start)} – ${fmt(a.end)}`, "cal")
      await notify(tx, l.owner_id, `${await nameOf(tx, me)} requested to reserve ${l.title}`, "/lender/requests")
      return
    }

    case "cancelBooking": {
      const b = await bookingFor(tx, a.id, me, "renter")
      if (!["requested", "confirmed"].includes(b.status)) throw new HttpError(409, "This can't be cancelled any more.")
      await tx`update bookings set status = 'cancelled', payout = null where id = ${b.id}`
      const what = b.kind === "tryon" ? "try-on" : "reservation"
      await event(tx, b, me, "Cancelled", `{actor} cancelled the ${what}`)
      await notify(tx, b.lender_id, `${await nameOf(tx, me)} cancelled the ${what} for ${b.listing_title}`, "/lender/requests")
      return
    }

    case "updateRental": {
      const b = await bookingFor(tx, a.id, me, "renter")
      if (b.kind !== "reservation" || !OPEN.includes(b.status)) throw new HttpError(409, "This rental can't be changed any more.")
      await tx`
        update bookings set
          pickup_time = ${a.pickupTime ?? b.pickup_time},
          return_time = ${a.returnTime ?? b.return_time},
          pickup_checklist = ${tx.json(a.pickupChecklist ?? b.pickup_checklist)},
          return_checklist = ${tx.json(a.returnChecklist ?? b.return_checklist)}
        where id = ${b.id}`
      const moved = a.pickupTime && a.pickupTime !== b.pickup_time ? `pickup to ${a.pickupTime}` : a.returnTime && a.returnTime !== b.return_time ? `return to ${a.returnTime}` : ""
      if (moved) {
        await event(tx, b, me, "Rental", `{actor} moved the ${moved}`, "cal")
        await notify(tx, b.lender_id, `${await nameOf(tx, me)} moved the ${moved} for ${b.listing_title}`, "/lender/requests")
      }
      return
    }

    case "extendRental": {
      const b = await bookingFor(tx, a.id, me, "renter")
      if (b.kind !== "reservation" || !["confirmed", "active"].includes(b.status) || !b.end_date) throw new HttpError(409, "This rental can't be extended.")
      const l = await listingFor(tx, b.listing_id)
      const end = addDaysISO(a.extraDays, new Date(`${b.end_date}T12:00:00`))
      await assertFree(tx, b.listing_id, b.start_date, end, b.id)
      const days = rentalDays(b.start_date, end)
      const price = quote(Number(l.price_per_day), days, Number(l.cleaning_fee))
      await tx`
        update bookings set end_date = ${end}, days = ${days}, subtotal = ${price.subtotal}, cleaning_fee = ${price.cleaningFee},
                            service_fee = ${price.serviceFee}, total = ${price.total}
        where id = ${b.id}`
      await event(tx, b, me, "Rental", `{actor} extended the rental to ${fmt(end)}`, "cal")
      await notify(tx, b.lender_id, `${await nameOf(tx, me)} extended ${b.listing_title} to ${fmt(end)}`, "/lender/requests")
      return
    }

    case "setRentalPhoto": {
      const b = await bookingFor(tx, a.id, me, "renter")
      const allowed = a.phase === "pickup" ? b.status === "confirmed" : b.status === "active"
      if (b.kind !== "reservation" || !allowed) throw new HttpError(409, "Photos can't be changed at this stage.")
      await tx`delete from uploads where booking_id = ${b.id} and phase = ${a.phase} and slot = ${a.key}`
      if (a.data) {
        const { contentType, data } = decode(a.data)
        await tx`
          insert into uploads (id, uploader_id, booking_id, phase, slot, content_type, data)
          values (${randomUUID()}, ${me}, ${b.id}, ${a.phase}, ${a.key}, ${contentType}, ${data})`
      }
      return
    }

    case "confirmPickup": {
      const b = await bookingFor(tx, a.id, me, "renter")
      if (b.kind !== "reservation" || b.status !== "confirmed") throw new HttpError(409, "This rental isn't ready for pickup.")
      await tx`update bookings set status = 'active' where id = ${b.id}`
      await event(tx, b, me, "Return", "Pickup confirmed with condition photos")
      await notify(tx, b.lender_id, `${await nameOf(tx, me)} picked up ${b.listing_title}`, "/lender/requests")
      return
    }

    case "confirmReturn": {
      const b = await bookingFor(tx, a.id, me, "renter")
      if (b.kind !== "reservation" || b.status !== "active") throw new HttpError(409, "This rental isn't out at the moment.")
      await settleReturn(tx, b)
      await event(tx, b, me, "Completed", "Return confirmed — deposit hold released")
      await notify(tx, me, `Your $${Number(b.deposit)} deposit for ${b.listing_title} was released`, `/rentals/${b.id}/return`)
      await notify(tx, b.lender_id, `${await nameOf(tx, me)} returned ${b.listing_title}. Your earnings are now available.`, "/lender/earnings")
      return
    }

    case "submitReview": {
      const b = await bookingFor(tx, a.id, me, "renter")
      if (b.kind !== "reservation" || b.status !== "returned" || b.reviewed) throw new HttpError(409, "This rental can't be reviewed.")
      const author = await nameOf(tx, me)
      await tx`update bookings set status = 'completed', reviewed = true where id = ${b.id}`
      await tx`
        insert into reviews (id, listing_id, booking_id, author_id, author_name, context, rating, lender_rating, text, tags)
        values (${`rv-${randomUUID()}`}, ${b.listing_id}, ${b.id}, ${me}, ${author}, 'Rented on Mutuari', ${a.outfit}, ${a.lender},
                ${a.text.trim() || a.tags.join(" · ")}, ${tx.json(a.tags)})`
      await tx`
        update listings set rating = round(((rating * review_count + ${a.outfit}) / (review_count + 1))::numeric, 1), review_count = review_count + 1
        where id = ${b.listing_id}`
      await notify(tx, b.lender_id, `${author} left a ${a.outfit}-star review for ${b.listing_title}`, `/listing/${b.listing_id}`)
      return
    }

    case "skipReview": {
      const b = await bookingFor(tx, a.id, me, "renter")
      if (b.status !== "returned") throw new HttpError(409, "There's nothing to skip.")
      await tx`update bookings set status = 'completed' where id = ${b.id}`
      return
    }

    case "respondRequest": {
      const b = await bookingFor(tx, a.id, me, "lender")
      if (b.status !== "requested") throw new HttpError(409, "This request was already answered or withdrawn.")
      const what = b.kind === "tryon" ? "try-on" : "reservation"
      const lender = await nameOf(tx, me)
      if (!a.accept) {
        await tx`update bookings set status = 'declined', responded_at = now() where id = ${b.id}`
        await event(tx, b, me, b.kind === "tryon" ? "Try-on" : "Request", `{actor} declined the ${what}`)
        await notify(tx, b.renter_id, `${lender} declined your ${what} request for ${b.listing_title}`, b.kind === "tryon" ? "/rentals?tab=tryons" : "/rentals")
        return
      }
      if (b.kind === "reservation") {
        await assertFree(tx, b.listing_id, b.start_date, b.end_date!)
        await tx`update bookings set status = 'confirmed', payout = 'pending', responded_at = now() where id = ${b.id}`
      } else {
        await tx`update bookings set status = 'confirmed', responded_at = now() where id = ${b.id}`
      }
      await event(tx, b, me, b.kind === "tryon" ? "Try-on" : "Request", `{actor} accepted the ${what}`)
      await notify(
        tx,
        b.renter_id,
        b.kind === "tryon" ? `${lender} confirmed your try-on for ${b.listing_title}` : `${lender} accepted your reservation for ${b.listing_title}`,
        b.kind === "tryon" ? "/rentals?tab=tryons" : `/rentals/${b.id}`
      )
      return
    }

    case "completeRequest": {
      const b = await bookingFor(tx, a.id, me, "lender")
      const lender = await nameOf(tx, me)
      if (b.kind === "tryon") {
        if (b.status !== "confirmed") throw new HttpError(409, "This try-on isn't booked.")
        await tx`update bookings set status = 'completed' where id = ${b.id}`
        await event(tx, b, me, "Try-on", "{actor} marked the try-on as done")
        return
      }
      if (!["confirmed", "active"].includes(b.status)) throw new HttpError(409, "This rental was already closed.")
      await settleReturn(tx, b)
      await event(tx, b, me, "Completed", "{actor} confirmed the outfit is back — deposit hold released")
      await notify(tx, b.renter_id, `${lender} confirmed ${b.listing_title} is back. Your $${Number(b.deposit)} deposit was released.`, `/rentals/${b.id}/return`)
      return
    }

    case "payOut": {
      await tx`update bookings set payout = 'paid' where lender_id = ${me} and payout = 'available'`
      return
    }

    case "openThread": {
      const l = await listingFor(tx, a.listingId)
      if (l.owner_id !== me) {
        await threadFor(tx, { id: a.id, listingId: l.id, renterId: me, lenderId: l.owner_id, context: a.context, by: me })
        return
      }
      // A lender can only start a conversation with someone who has already asked about this listing.
      const known = await tx`
        select 1 from bookings where listing_id = ${l.id} and renter_id = ${a.personId}
        union all select 1 from threads where listing_id = ${l.id} and renter_id = ${a.personId} limit 1`
      if (a.personId === me || !known.length) throw new HttpError(403, "You can message renters once they've contacted you.")
      await threadFor(tx, { id: a.id, listingId: l.id, renterId: a.personId, lenderId: me, context: a.context, by: me })
      return
    }

    case "sendMessage": {
      const text = a.text.trim()
      if (!text && !a.image) throw new HttpError(400, "Write a message first.")
      const [t] = await tx<{ id: string; renter_id: string; lender_id: string }[]>`
        select id, renter_id, lender_id from threads where id = ${a.threadId} and ${me} in (renter_id, lender_id)`
      if (!t) throw new HttpError(404, "That conversation no longer exists.")
      let uploadId: string | undefined
      if (a.image) {
        const { contentType, data } = decode(a.image)
        uploadId = randomUUID()
        await tx`insert into uploads (id, uploader_id, thread_id, content_type, data) values (${uploadId}, ${me}, ${t.id}, ${contentType}, ${data})`
      }
      await say(tx, t.id, me, text, { id: a.id, icon: a.icon, uploadId })
      await tx`update threads set ${tx(t.renter_id === me ? "renter_read_at" : "lender_read_at")} = now() where id = ${t.id}`
      // Sample people answer with a short canned reply so the conversation isn't one-sided.
      const other = t.renter_id === me ? t.lender_id : t.renter_id
      const [sample] = await tx`select 1 from users where id = ${other} and is_sample`
      if (sample) await say(tx, t.id, other, SAMPLE_REPLIES[randomInt(SAMPLE_REPLIES.length)]!, { after: SAMPLE_REPLY_AFTER })
      return
    }

    case "markThreadRead": {
      await tx`update threads set renter_read_at = now() where id = ${a.threadId} and renter_id = ${me}`
      await tx`update threads set lender_read_at = now() where id = ${a.threadId} and lender_id = ${me}`
      return
    }

    case "markNotificationsRead": {
      await tx`update notifications set read = true where user_id = ${me} and not read`
      return
    }
  }
}
