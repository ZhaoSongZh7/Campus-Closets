"use client"

import { useSyncExternalStore } from "react"

import { addDaysISO, fmt, initialsOf, milesBetween, quote, rentalDays, todayISO } from "./format"
import type { Account, Activity, ApiListing, Bootstrap, Geo, Listing, Message, Person, PhotoKey, Place, Rental, State, Thread, TryOn } from "./types"

/**
 * The app state mirrors the server: the signed-in account, listings, and the
 * user's activity (rentals, requests, messages, notifications).
 *
 * Changes are shown immediately and sent to the API, which answers with the
 * activity as it now stands. A short poll picks up what other people did.
 */

const REFRESH_AFTER_MS = 30_000

type Snapshot = { state: State | null; status: "loading" | "ready" | "error"; error: string }

let remote: Bootstrap | null = null
let snapshot: Snapshot = { state: null, status: "loading", error: "" }
const SERVER_SNAPSHOT: Snapshot = { state: null, status: "loading", error: "" }
let started = false
let lastFetch = 0
let accountWrites = 0
/** Actions waiting for the server. While any are, fetched activity would be stale, so it is ignored. */
let pending = 0
let queue: Promise<unknown> = Promise.resolve()
/** Notifications already seen, so only new ones are announced. */
let announced: Set<string> | null = null
let reportError: (message: string) => void = () => {}
let reportNotice: (message: string) => void = () => {}
const listeners = new Set<() => void>()

// ---------- plumbing ----------

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number }

async function api<T>(path: string, init?: { method: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (!res.ok) return { ok: false, error: data.error ?? "Something went wrong.", status: res.status }
    return { ok: true, data }
  } catch {
    return { ok: false, error: "Can't reach the server. Check your connection and try again.", status: 0 }
  }
}

/** Ids for new rows are chosen here so the UI can link to them before the server answers. */
const newId = (prefix: string) => `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`

function toClientListing(l: ApiListing, me: Account | null, activity: Activity, from: Geo | null): Listing {
  const { ownerId, ...rest } = l
  return {
    ...rest,
    lenderId: me && ownerId === me.id ? "me" : ownerId,
    booked: activity.booked[l.id] ?? [],
    distance: from && l.geo ? milesBetween(from, l.geo) : null,
  }
}

// The place picked on Browse or the home page. It outranks the account's own place and is remembered in this browser.
const NEAR_KEY = "campus-closet:near"
let near: Place | null = null
function loadNear() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(NEAR_KEY) ?? "null") as Partial<Place> | null
    if (saved && typeof saved.label === "string" && typeof saved.lat === "number" && typeof saved.lng === "number") near = { label: saved.label, lat: saved.lat, lng: saved.lng }
  } catch {
    /* storage unavailable or unreadable: start without a picked place */
  }
}
function saveNear() {
  try {
    if (near) window.localStorage.setItem(NEAR_KEY, JSON.stringify(near))
    else window.localStorage.removeItem(NEAR_KEY)
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

function compose() {
  if (!remote) return
  const me = remote.account
  const a = remote.activity
  const people = new Map<string, Person>()
  for (const p of [...remote.people, ...a.people]) people.set(p.id, p)
  const state: State = {
    favorites: a.favorites,
    rentals: a.rentals,
    tryOns: a.tryOns,
    requests: a.requests,
    transactions: a.transactions,
    threads: a.threads,
    notifications: a.notifications,
    reviews: a.reviews,
    accounts: me ? [me] : [],
    session: me?.id ?? null,
    people: [...people.values()],
    listings: remote.listings.map((l) => toClientListing(l, me, a, near ?? me?.geo ?? null)),
    near,
  }
  snapshot = { state, status: "ready", error: "" }
  listeners.forEach((l) => l())
}

/** Shows a change right away. The server's answer replaces it a moment later. */
function set(updater: (s: State) => State) {
  if (!snapshot.state || !remote) return
  const next = updater(snapshot.state)
  remote = {
    ...remote,
    activity: {
      ...remote.activity,
      favorites: next.favorites,
      rentals: next.rentals,
      tryOns: next.tryOns,
      requests: next.requests,
      transactions: next.transactions,
      threads: next.threads,
      notifications: next.notifications,
      reviews: next.reviews,
    },
  }
  compose()
}

function applyActivity(activity: Activity, announce: boolean) {
  if (!remote) return
  remote = { ...remote, activity }
  // What other people did arrives by polling and is announced; the result of your own action is not.
  if (announce && announced) for (const n of activity.notifications) if (!n.read && !announced.has(n.id)) reportNotice(n.text)
  announced = new Set(activity.notifications.map((n) => n.id))
  compose()
}

async function refresh() {
  const res = await api<Bootstrap>("/api/bootstrap")
  lastFetch = Date.now()
  if (!res.ok) {
    // Keep showing what we have if a background refresh fails.
    if (!remote) {
      snapshot = { state: null, status: "error", error: res.error }
      listeners.forEach((l) => l())
    }
    return false
  }
  const userChanged = !remote || remote.account?.id !== res.data.account?.id
  if (userChanged) announced = null
  // Don't let this answer overwrite a change that is still on its way to the server.
  const activity = !userChanged && remote && pending > 0 ? remote.activity : res.data.activity
  remote = { ...res.data, activity }
  applyActivity(activity, !userChanged)
  return true
}

/** Fetches what other people did since the last check. */
async function poll() {
  if (!remote?.account || pending > 0 || document.visibilityState !== "visible") return
  const res = await api<Activity>("/api/activity")
  if (res.ok && pending === 0 && remote?.account) applyActivity(res.data, true)
}

type Result = { ok: true } | { ok: false; error: string }

/**
 * Sends one action to the server after showing its effect locally. Actions go
 * out one at a time and in order, so "open a conversation" always lands before
 * "send the first message in it".
 */
function act(action: { type: string } & Record<string, unknown>, optimistic?: (s: State) => State): Promise<Result> {
  if (optimistic) set(optimistic)
  pending++
  const run = queue.then(async (): Promise<Result> => {
    const res = await api<Activity>("/api/activity", { method: "POST", body: action })
    pending--
    if (!res.ok) {
      reportError(res.error)
      // Put back what the server really has, undoing the optimistic change.
      if (pending === 0) await refresh()
      return { ok: false, error: res.error }
    }
    if (pending === 0) applyActivity(res.data, false)
    return { ok: true }
  })
  queue = run
  return run
}

function start() {
  if (started) return
  started = true
  loadNear()
  void refresh()
  // Pick up listings other people added while this tab was in the background.
  window.addEventListener("focus", () => {
    if (Date.now() - lastFetch > REFRESH_AFTER_MS) void refresh()
  })
  // Earlier versions kept rentals and messages in this browser. That data now lives on the server.
  try {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith("mutuari:v")) window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable: nothing to clean up */
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
  }
}

export function useAppSnapshot(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT
  )
}

export function onStoreError(cb: (message: string) => void) {
  reportError = cb
}

/** Called with the text of each new notification (a request, an acceptance, …) as it arrives. */
export function onStoreNotice(cb: (message: string) => void) {
  reportNotice = cb
}

export function retryLoad() {
  snapshot = { state: null, status: "loading", error: "" }
  listeners.forEach((l) => l())
  void refresh()
}

// ---------- selectors ----------

export const currentAccount = (s: State): Account | null => s.accounts.find((a) => a.id === s.session) ?? null

export const listingById = (s: State, id: string) => s.listings.find((l) => l.id === id)

export function personFor(s: State, id: string): Person {
  if (id === "me") {
    const a = currentAccount(s)
    const name = a ? `${a.firstName} ${a.lastName}`.trim() : "You"
    return {
      id: "me",
      name,
      initials: initialsOf(name) || "ME",
      verified: a?.idVerified ?? false,
      rentals: s.listings.filter((l) => l.lenderId === "me").reduce((n, l) => n + l.rentals, 0),
      rating: 0,
      replyTime: "Usually replies within an hour",
      memberSince: a ? new Date(a.createdAt).getFullYear() : new Date().getFullYear(),
      neighborhood: a?.zip || "Your neighborhood",
    }
  }
  return (
    s.people.find((p) => p.id === id) ?? {
      id,
      name: "Member",
      initials: "M",
      verified: false,
      rentals: 0,
      rating: 0,
      replyTime: "",
      memberSince: new Date().getFullYear(),
      neighborhood: "",
    }
  )
}

export const isRentedNow = (l: Listing) => {
  const t = todayISO()
  return l.booked.find((b) => b.start <= t && t <= b.end)
}

export const nextBooking = (l: Listing) => {
  const t = todayISO()
  return [...l.booked].filter((b) => b.start > t).sort((a, b) => (a.start < b.start ? -1 : 1))[0]
}

export const unreadCount = (s: State) => s.threads.filter((t) => t.unread).length

// ---------- helpers for showing a change before the server confirms it ----------

function pushMessage(threads: Thread[], threadId: string, msg: Omit<Message, "id" | "at"> & { id?: string }) {
  return threads.map((t) => (t.id === threadId ? { ...t, messages: [...t.messages, { ...msg, id: msg.id ?? newId("m-"), at: Date.now() }] } : t))
}

function ensureThread(s: State, personId: string, listingId: string, context: string, role: Thread["role"], id = newId("th-")) {
  const existing = s.threads.find((t) => t.personId === personId && t.listingId === listingId)
  if (existing) {
    const rest = s.threads.filter((t) => t.id !== existing.id)
    return { threads: [{ ...existing, context }, ...rest], id: existing.id, created: false }
  }
  return { threads: [{ id, personId, listingId, context, role, unread: false, messages: [] }, ...s.threads], id, created: true }
}

const patchRental = (s: State, id: string, patch: Partial<Rental>): State => ({ ...s, rentals: s.rentals.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

/** Booked dates, rental counts and ratings live on listings, so reload them after an action that changes one. */
const thenRefresh = (result: Promise<Result>) => void result.then((r) => r.ok && refresh())

/** The fields of a listing its owner controls, in the shape the API accepts. */
function toListingInput(l: Listing) {
  return {
    title: l.title,
    category: l.category,
    brand: l.brand,
    color: l.color,
    size: l.size,
    sizeGroup: l.sizeGroup,
    sizeNote: l.sizeNote,
    fit: l.fit,
    description: l.description,
    occasions: l.occasions,
    styles: l.styles,
    pricePerDay: l.pricePerDay,
    minDays: l.minDays,
    deposit: l.deposit,
    cleaningFee: l.cleaningFee,
    cleaningIncluded: l.cleaningIncluded,
    tryOn: l.tryOn,
    status: l.status,
    pickupArea: l.pickupArea,
    handoff: l.handoff,
    days: l.days,
    careNotes: l.careNotes,
    photos: l.photos,
    condition: l.condition,
  }
}

function setRemoteListings(update: (listings: ApiListing[]) => ApiListing[]) {
  if (!remote) return
  remote = { ...remote, listings: update(remote.listings) }
  compose()
}

// ---------- actions ----------

export type SignUpInput = { firstName: string; lastName: string; email: string; password: string; zip: string }

export const actions = {
  // ----- account -----

  async signUp(input: SignUpInput): Promise<Result> {
    const res = await api<{ account: Account }>("/api/auth/signup", { method: "POST", body: input })
    if (!res.ok) return res
    await refresh()
    return { ok: true }
  },

  async logIn(email: string, password: string): Promise<Result> {
    const res = await api<{ account: Account }>("/api/auth/login", { method: "POST", body: { email, password } })
    if (!res.ok) return res
    await refresh()
    return { ok: true }
  },

  async logOut() {
    await api("/api/auth/logout", { method: "POST" })
    await refresh()
  },

  /** Sets (or, with null, clears) the place distances are measured from in this browser. */
  setNear(place: Place | null) {
    near = place
    saveNear()
    compose()
  },

  /**
   * Finds the place for a device position or for typed text ("08540", "Princeton, NJ").
   * Resolves to null when it can't be matched.
   */
  async findPlace(query: { lat: number; lng: number } | { text: string }): Promise<Place | null> {
    const res = await api<{ place: Place | null }>("/api/geo", { method: "POST", body: query })
    return res.ok ? res.data.place : null
  },

  /** Updates the signed-in account: shown immediately, then confirmed by the server. */
  updateAccount(patch: Partial<Account>) {
    if (!remote?.account) return
    remote = { ...remote, account: { ...remote.account, ...patch } }
    compose()
    // JSON drops `undefined`, so send null to clear a field (e.g. removing the avatar).
    const body = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v]))
    const write = ++accountWrites
    void api<{ account: Account }>("/api/me", { method: "PATCH", body }).then((res) => {
      if (write !== accountWrites) return // a newer edit is already on its way
      if (res.ok && remote) {
        remote = { ...remote, account: res.data.account }
        compose()
      } else if (!res.ok) {
        reportError(res.error)
        void refresh()
      }
    })
  },

  async deactivateAccount(): Promise<Result> {
    const res = await api("/api/me", { method: "DELETE" })
    if (!res.ok) return res
    await refresh()
    return { ok: true }
  },

  /** Checks for new requests, replies and notifications. Called on a timer while the app is open. */
  poll,

  // ----- listings -----

  async saveListing(listing: Listing, isNew: boolean): Promise<Result> {
    const res = isNew
      ? await api<{ listing: ApiListing }>("/api/listings", { method: "POST", body: toListingInput(listing) })
      : await api<{ listing: ApiListing }>(`/api/listings/${listing.id}`, { method: "PUT", body: toListingInput(listing) })
    if (!res.ok) return res
    const saved = res.data.listing
    setRemoteListings((all) => (all.some((l) => l.id === saved.id) ? all.map((l) => (l.id === saved.id ? saved : l)) : [saved, ...all]))
    return { ok: true }
  },

  setListingStatus(id: string, status: Listing["status"]) {
    const listing = snapshot.state && listingById(snapshot.state, id)
    if (!listing) return
    setRemoteListings((all) => all.map((l) => (l.id === id ? { ...l, status } : l)))
    void api(`/api/listings/${id}`, { method: "PUT", body: toListingInput({ ...listing, status }) }).then((res) => {
      if (!res.ok) {
        reportError(res.error)
        void refresh()
      }
    })
  },

  deleteListing(id: string) {
    setRemoteListings((all) => all.filter((l) => l.id !== id))
    void api(`/api/listings/${id}`, { method: "DELETE" }).then((res) => {
      if (!res.ok) {
        reportError(res.error)
        void refresh()
      }
    })
  },

  // ----- saved outfits -----

  toggleFavorite(listingId: string) {
    void act({ type: "toggleFavorite", listingId }, (s) => ({
      ...s,
      favorites: s.favorites.includes(listingId) ? s.favorites.filter((f) => f !== listingId) : [...s.favorites, listingId],
    }))
  },

  // ----- renting -----

  requestTryOn(input: Pick<TryOn, "listingId" | "date" | "time" | "place" | "note">) {
    const id = newId("to-")
    void act({ type: "requestTryOn", id, ...input }, (s) => {
      const listing = listingById(s, input.listingId)!
      const t = ensureThread(s, listing.lenderId, listing.id, "Try-on", "renting")
      let threads = pushMessage(t.threads, t.id, { from: "system", icon: "cal", text: `Try-on requested for ${fmt(input.date)} · ${input.time}` })
      if (input.note.trim()) threads = pushMessage(threads, t.id, { from: "me", text: input.note.trim() })
      return { ...s, threads, tryOns: [{ ...input, id, status: "requested", createdAt: todayISO() }, ...s.tryOns] }
    })
    return id
  },

  rescheduleTryOn(id: string, date: string, time: string) {
    void act({ type: "rescheduleTryOn", id, date, time }, (s) => ({ ...s, tryOns: s.tryOns.map((t) => (t.id === id ? { ...t, date, time } : t)) }))
  },

  cancelTryOn(id: string) {
    void act({ type: "cancelBooking", id }, (s) => ({ ...s, tryOns: s.tryOns.map((t) => (t.id === id ? { ...t, status: "cancelled" } : t)) }))
  },

  createReservation(input: {
    listingId: string
    start: string
    end: string
    eventDate?: string
    pickupTime: string
    returnTime: string
    place: Rental["place"]
    saveCard?: string
  }) {
    const id = newId("rn-")
    const { saveCard, ...request } = input
    void act({ type: "createReservation", id, ...request }, (s) => {
      const listing = listingById(s, input.listingId)!
      const days = rentalDays(input.start, input.end)
      const triedOn = s.tryOns.find((t) => t.listingId === listing.id && t.status !== "cancelled")
      const rental: Rental = {
        id,
        code: "RSV-····",
        listingId: listing.id,
        status: "requested",
        start: input.start,
        end: input.end,
        eventDate: input.eventDate,
        pickupTime: input.pickupTime,
        returnTime: input.returnTime,
        place: input.place,
        days,
        ...quote(listing.pricePerDay, days, listing.cleaningFee),
        deposit: listing.deposit,
        handoffCode: "····",
        pickupChecklist: [false, false, false],
        pickupPhotos: {},
        returnChecklist: [false, false, false],
        returnPhotos: {},
        reviewed: false,
        triedOn: triedOn?.date,
        createdAt: todayISO(),
      }
      const t = ensureThread(s, listing.lenderId, listing.id, "Request", "renting")
      const threads = pushMessage(t.threads, t.id, { from: "system", icon: "cal", text: `Reservation requested for ${fmt(input.start)} – ${fmt(input.end)}` })
      return { ...s, threads, rentals: [rental, ...s.rentals] }
    })
    if (saveCard) actions.updateAccount({ card: { last4: saveCard } })
    return id
  },

  /** Changes the pickup/return time or ticks off a checklist item. */
  updateRental(id: string, patch: Partial<Pick<Rental, "pickupTime" | "returnTime" | "pickupChecklist" | "returnChecklist">>) {
    void act({ type: "updateRental", id, ...patch }, (s) => patchRental(s, id, patch))
  },

  extendRental(id: string, extraDays: number) {
    thenRefresh(
      act({ type: "extendRental", id, extraDays }, (s) => ({
        ...s,
        rentals: s.rentals.map((r) => {
          if (r.id !== id) return r
          const listing = listingById(s, r.listingId)!
          const end = addDaysISO(extraDays, new Date(`${r.end}T12:00:00`))
          const days = rentalDays(r.start, end)
          return { ...r, end, days, ...quote(listing.pricePerDay, days, listing.cleaningFee) }
        }),
      }))
    )
  },

  setRentalPhoto(id: string, phase: "pickup" | "return", key: PhotoKey, dataUrl: string | undefined) {
    void act({ type: "setRentalPhoto", id, phase, key, data: dataUrl ?? null }, (s) => ({
      ...s,
      rentals: s.rentals.map((r) => {
        if (r.id !== id) return r
        const field = phase === "pickup" ? "pickupPhotos" : "returnPhotos"
        return { ...r, [field]: { ...r[field], [key]: dataUrl } }
      }),
    }))
  },

  confirmPickup(id: string) {
    void act({ type: "confirmPickup", id }, (s) => patchRental(s, id, { status: "active" }))
  },

  confirmReturn(id: string) {
    thenRefresh(act({ type: "confirmReturn", id }, (s) => patchRental(s, id, { status: "returned" })))
  },

  submitReview(id: string, review: { outfit: number; lender: number; tags: string[]; text: string }) {
    thenRefresh(act({ type: "submitReview", id, ...review }, (s) => patchRental(s, id, { status: "completed", reviewed: true })))
  },

  skipReview(id: string) {
    void act({ type: "skipReview", id }, (s) => patchRental(s, id, { status: "completed" }))
  },

  cancelRental(id: string) {
    thenRefresh(act({ type: "cancelBooking", id }, (s) => patchRental(s, id, { status: "cancelled" })))
  },

  // ----- lending -----

  respondRequest(id: string, accept: boolean) {
    thenRefresh(
      act({ type: "respondRequest", id, accept }, (s) => ({
        ...s,
        requests: s.requests.map((r) => (r.id === id ? { ...r, status: accept ? "accepted" : "declined", respondedAt: Date.now() } : r)),
      }))
    )
  },

  /** Lender confirms the handoff is done (try-on happened / outfit came back). */
  completeRequest(id: string) {
    thenRefresh(
      act({ type: "completeRequest", id }, (s) => ({
        ...s,
        requests: s.requests.map((r) => (r.id === id ? { ...r, status: "completed" } : r)),
        transactions: s.transactions.map((t) => (t.requestId === id ? { ...t, status: "available", date: todayISO() } : t)),
      }))
    )
  },

  /** Pays out everything that is available and returns the amount. */
  payOut() {
    const s = snapshot.state
    if (!s) return 0
    const amount = s.transactions.filter((t) => t.status === "available").reduce((n, t) => n + t.earn, 0)
    void act({ type: "payOut" }, (st) => ({ ...st, transactions: st.transactions.map((t) => (t.status === "available" ? { ...t, status: "paid" } : t)) }))
    return amount
  },

  // ----- messages and notifications -----

  /** Opens (or creates) the conversation with someone about a listing and returns its id. */
  openThread(personId: string, listingId: string, context: string, role: Thread["role"]) {
    const s = snapshot.state
    if (!s) return ""
    const t = ensureThread(s, personId, listingId, context, role)
    if (t.created) void act({ type: "openThread", id: t.id, listingId, personId, context }, (st) => ({ ...st, threads: ensureThread(st, personId, listingId, context, role, t.id).threads }))
    return t.id
  },

  sendMessage(threadId: string, msg: { text: string; image?: string; icon?: Message["icon"] }) {
    const id = newId("m-")
    void act({ type: "sendMessage", id, threadId, ...msg }, (s) => {
      const thread = s.threads.find((t) => t.id === threadId)
      if (!thread) return s
      const rest = s.threads.filter((t) => t.id !== threadId)
      return { ...s, threads: pushMessage([thread, ...rest], threadId, { id, from: "me", ...msg }) }
    })
  },

  markThreadRead(threadId: string) {
    if (!snapshot.state?.threads.find((t) => t.id === threadId)?.unread) return
    void act({ type: "markThreadRead", threadId }, (st) => ({ ...st, threads: st.threads.map((t) => (t.id === threadId ? { ...t, unread: false } : t)) }))
  },

  markNotificationsRead() {
    if (!snapshot.state?.notifications.some((n) => !n.read)) return
    void act({ type: "markNotificationsRead" }, (st) => ({ ...st, notifications: st.notifications.map((n) => ({ ...n, read: true })) }))
  },
}
