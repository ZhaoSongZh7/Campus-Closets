"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Calendar, Ellipsis, Leaf, MapPin, Search, Shirt } from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { DateField, EmptyState, Field, Photo, LinkButton, PageTitle, Panel, Row, SegTabs, SimpleSelect } from "@/components/kit"
import { rentalBadge, useMessage } from "@/components/rental-bits"
import { MapArt } from "@/components/map-art"
import { AppShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { compactRange, fmt, fmtShort, money, relDay, TIME_SLOTS, todayISO } from "@/lib/format"
import { actions, listingById, personFor } from "@/lib/store"
import type { Listing, Rental, TryOn } from "@/lib/types"

type Tab = "all" | "tryons" | "upcoming" | "active" | "past"
type Group = "ACTIVE" | "UPCOMING" | "TRY-ONS" | "PAST"
type Item = { group: Group; listing: Listing; rental?: Rental; tryOn?: TryOn; sortKey: string }

const directions = (area: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(area)}`

function RentalsView() {
  const s = useApp()
  const router = useRouter()
  const params = useSearchParams()
  const message = useMessage()
  const initial = params.get("tab") as Tab | null
  const [tab, setTab] = useState<Tab>(initial && ["all", "tryons", "upcoming", "active", "past"].includes(initial) ? initial : "all")
  const [query, setQuery] = useState("")
  const [reschedule, setReschedule] = useState<TryOn | null>(null)
  const [date, setDate] = useState<string>()
  const [time, setTime] = useState("")

  const items: Item[] = []
  for (const r of s.rentals) {
    const listing = listingById(s, r.listingId)
    if (!listing) continue
    const group: Group = r.status === "active" ? "ACTIVE" : r.status === "requested" || r.status === "confirmed" ? "UPCOMING" : "PAST"
    items.push({ group, listing, rental: r, sortKey: group === "PAST" ? r.end : r.start })
  }
  for (const t of s.tryOns) {
    const listing = listingById(s, t.listingId)
    if (!listing) continue
    const past = t.status === "cancelled" || t.status === "done" || t.date < todayISO()
    items.push({ group: past ? "PAST" : "TRY-ONS", listing, tryOn: t, sortKey: t.date })
  }

  const counts = {
    tryons: items.filter((i) => i.group === "TRY-ONS").length,
    upcoming: items.filter((i) => i.group === "UPCOMING").length,
    active: items.filter((i) => i.group === "ACTIVE").length,
  }
  const groupsFor: Record<Tab, Group[]> = {
    all: ["ACTIVE", "UPCOMING", "TRY-ONS", "PAST"],
    tryons: ["TRY-ONS"],
    upcoming: ["UPCOMING"],
    active: ["ACTIVE"],
    past: ["PAST"],
  }
  const q = query.trim().toLowerCase()
  const visible = items.filter(
    (i) => groupsFor[tab].includes(i.group) && (!q || `${i.listing.title} ${personFor(s, i.listing.lenderId).name}`.toLowerCase().includes(q))
  )

  // The soonest thing the renter has to show up for.
  const handoffs = [
    ...s.rentals.filter((r) => r.status === "active").map((r) => ({ what: "Return", date: r.end, time: r.returnTime, listingId: r.listingId })),
    ...s.rentals.filter((r) => r.status === "confirmed").map((r) => ({ what: "Pickup", date: r.start, time: r.pickupTime, listingId: r.listingId })),
    ...s.tryOns.filter((t) => t.status === "booked" && t.date >= todayISO()).map((t) => ({ what: "Try-on", date: t.date, time: t.time, listingId: t.listingId })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1))
  const next = handoffs[0]
  const nextListing = next && listingById(s, next.listingId)
  const rented = s.rentals.filter((r) => ["active", "returned", "completed"].includes(r.status))
  const lendersMet = new Set(rented.map((r) => listingById(s, r.listingId)?.lenderId)).size

  const card = (item: Item) => {
    const { listing, rental, tryOn } = item
    const lender = personFor(s, listing.lenderId)
    const badge = rental
      ? rentalBadge(rental)
      : tryOn!.status === "requested"
        ? ({ label: "Awaiting lender", variant: "warning" } as const)
        : tryOn!.status === "cancelled"
          ? ({ label: "Cancelled", variant: "outline" } as const)
          : item.group === "PAST"
            ? ({ label: "Try-on done", variant: "secondary" } as const)
            : ({ label: "Try-on booked", variant: "secondary" } as const)
    const sub = tryOn
      ? `${lender.name} · Free try-on`
      : item.group === "PAST"
        ? `${lender.name} · ${compactRange(rental!.start, rental!.end)}`
        : `${lender.name} · ${money(listing.pricePerDay)} / day`
    const when = tryOn
      ? `${fmt(tryOn.date)} · ${tryOn.time}`
      : rental!.status === "active"
        ? `Return ${fmt(rental!.end)} · ${rental!.returnTime}`
        : item.group === "PAST"
          ? rental!.status === "cancelled" ? "Cancelled" : `Returned ${fmtShort(rental!.end)}`
          : `Pickup ${fmt(rental!.start)} · ${rental!.pickupTime}`
    const openMessage = () => message(listing.lenderId, listing.id, tryOn ? "Try-on" : "Request", "renting")

    return (
      <Panel key={rental?.id ?? tryOn!.id} className="flex-row flex-wrap items-center gap-4 p-4">
        <Photo src={listing.photos[0]} alt={listing.title} className="h-28 w-[88px] shrink-0 rounded-lg" />
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold">{listing.title}</p>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{sub}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><Calendar className="size-3.5" /> {when}</span>
            <span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {listing.pickupArea}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rental?.status === "active" && (
            <>
              <Button variant="outline" onClick={openMessage}>Message</Button>
              <LinkButton href={`/rentals/${rental.id}/return`}>Start return</LinkButton>
            </>
          )}
          {rental?.status === "confirmed" && (
            <>
              <Button variant="outline" onClick={openMessage}>Message</Button>
              <LinkButton href={`/rentals/${rental.id}`}>View rental</LinkButton>
            </>
          )}
          {rental?.status === "requested" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  actions.cancelRental(rental.id)
                  toast.success("Reservation request cancelled")
                }}
              >
                Cancel
              </Button>
              <LinkButton href={`/rentals/${rental.id}`}>View request</LinkButton>
            </>
          )}
          {rental && item.group === "PAST" && (
            <>
              {rental.status === "returned" && !rental.reviewed && (
                <LinkButton href={`/rentals/${rental.id}/return`} variant="outline">Leave review</LinkButton>
              )}
              <LinkButton href={`/listing/${listing.id}`}>Rent again</LinkButton>
            </>
          )}
          {tryOn && item.group === "TRY-ONS" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setReschedule(tryOn)
                  setDate(tryOn.date)
                  setTime(tryOn.time)
                }}
              >
                Reschedule
              </Button>
              <LinkButton href={`/listing/${listing.id}`}>View details</LinkButton>
            </>
          )}
          {tryOn && item.group === "PAST" && <LinkButton href={`/listing/${listing.id}`}>View outfit</LinkButton>}
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`More actions for ${listing.title}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => router.push(`/listing/${listing.id}`)}>View listing</DropdownMenuItem>
              <DropdownMenuItem onClick={openMessage}>Message lender</DropdownMenuItem>
              {rental && rental.status !== "cancelled" && (
                <DropdownMenuItem onClick={() => router.push(`/rentals/${rental.id}`)}>Rental details</DropdownMenuItem>
              )}
              {tryOn && item.group === "TRY-ONS" && (
                <>
                  <DropdownMenuItem onClick={() => router.push(`/listing/${listing.id}/reserve`)}>Reserve outfit</DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      actions.cancelTryOn(tryOn.id)
                      toast.success("Try-on cancelled")
                    }}
                  >
                    Cancel try-on
                  </DropdownMenuItem>
                </>
              )}
              {rental?.status === "confirmed" && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    actions.cancelRental(rental.id)
                    toast.success("Reservation cancelled")
                  }}
                >
                  Cancel reservation
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Panel>
    )
  }

  return (
    <>
      <PageTitle title="My rentals" description="Track try-ons, reservations, pickups, and returns.">
        <LinkButton href="/browse" variant="outline">
          <Search /> Browse outfits
        </LinkButton>
      </PageTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegTabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All" },
            { value: "tryons", label: `Try-ons (${counts.tryons})` },
            { value: "upcoming", label: `Upcoming (${counts.upcoming})` },
            { value: "active", label: `Active (${counts.active})` },
            { value: "past", label: "Past" },
          ]}
        />
        <span className="relative w-full sm:w-[260px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search rentals" aria-label="Search rentals" className="pl-9" />
        </span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {visible.length === 0 && (
            <EmptyState icon={Shirt} title="Nothing here yet" description="Reservations and try-ons you request will show up here.">
              <LinkButton href="/browse">Browse outfits</LinkButton>
            </EmptyState>
          )}
          {groupsFor[tab].map((group) => {
            const rows = visible
              .filter((i) => i.group === group)
              .sort((a, b) => (group === "PAST" ? (a.sortKey < b.sortKey ? 1 : -1) : a.sortKey < b.sortKey ? -1 : 1))
            if (!rows.length) return null
            return (
              <section key={group} className="flex flex-col gap-3">
                <h2 className="text-[11px] font-semibold tracking-[0.66px] text-muted-foreground">{group}</h2>
                {rows.map(card)}
              </section>
            )
          })}
        </div>

        <aside className="flex flex-col gap-4">
          <Panel className="gap-4">
            <h2 className="text-base font-semibold">Next handoff</h2>
            {next && nextListing ? (
              <>
                <MapArt seed={nextListing.pickupArea || nextListing.id} label={nextListing.pickupArea} className="h-[120px]" />
                <div className="flex flex-col gap-2.5">
                  <Row label="What" value={`${next.what} · ${nextListing.title}`} />
                  <Row label="When" value={`${relDay(next.date)} · ${next.time}`} />
                  <Row label="Where" value={nextListing.pickupArea} />
                </div>
                <a href={directions(nextListing.pickupArea)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
                  <MapPin /> Get directions
                </a>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No pickups, returns or try-ons coming up.</p>
            )}
          </Panel>
          <Panel className="items-start gap-4">
            <Badge variant="success">
              <Leaf /> Your impact
            </Badge>
            <div className="grid w-full grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 rounded-[10px] border bg-subtle p-4">
                <p className="text-2xl font-semibold">{rented.length}</p>
                <p className="text-xs text-muted-foreground">Outfits rented</p>
              </div>
              <div className="flex flex-col gap-1 rounded-[10px] border bg-subtle p-4">
                <p className="text-2xl font-semibold">{lendersMet}</p>
                <p className="text-xs text-muted-foreground">Local lenders met</p>
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground">Each rental helps most when it replaces buying something new.</p>
          </Panel>
        </aside>
      </div>

      <Dialog open={Boolean(reschedule)} onOpenChange={(o) => !o && setReschedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule try-on</DialogTitle>
            <DialogDescription>Pick a new day and time. The lender is notified of the change.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Day">
              <DateField value={date} onChange={setDate} min={todayISO()} />
            </Field>
            <Field label="Time">
              <SimpleSelect value={time} onChange={setTime} options={TIME_SLOTS} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReschedule(null)}>Cancel</Button>
            <Button
              disabled={!date || !time}
              onClick={() => {
                actions.rescheduleTryOn(reschedule!.id, date!, time)
                toast.success(`Try-on moved to ${fmt(date!)} · ${time}`)
                setReschedule(null)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function WithParams() {
  const params = useSearchParams()
  return <RentalsView key={params.get("tab") ?? "all"} />
}

export default function RentalsPage() {
  return (
    <AppShell auth>
      <Suspense>
        <WithParams />
      </Suspense>
    </AppShell>
  )
}
