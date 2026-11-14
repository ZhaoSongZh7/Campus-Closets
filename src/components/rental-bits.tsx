"use client"

import { useRouter } from "next/navigation"
import { MessageSquare, Shirt } from "lucide-react"

import { useApp } from "@/components/app-provider"
import { EmptyState, Photo, LinkButton, Panel, PersonAvatar, Rating, Row } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { money, range, todayISO } from "@/lib/format"
import { actions, currentAccount, personFor } from "@/lib/store"
import type { Listing, PhotoKey, Rental, Thread } from "@/lib/types"

export function ListingSummary({ listing, subtitle }: { listing: Listing; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <Photo
        src={listing.photos[0] ?? listing.condition.front}
        alt={listing.title}
       
        className="h-[88px] w-[72px] shrink-0 rounded-lg"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-[15px] font-semibold">{listing.title}</p>
        <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
        <Rating value={listing.rating} />
      </div>
    </div>
  )
}

/** Opens (or creates) the conversation about a listing and navigates to it. */
export function useMessage() {
  const s = useApp()
  const router = useRouter()
  return (personId: string, listingId: string, context: string, role: Thread["role"]) => {
    if (!currentAccount(s)) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
      return
    }
    const id = actions.openThread(personId, listingId, context, role)
    router.push(`/messages?thread=${id}`)
  }
}

export function LenderCard({ listing, context = "Request" }: { listing: Listing; context?: string }) {
  const s = useApp()
  const message = useMessage()
  const lender = personFor(s, listing.lenderId)
  return (
    <Panel className="flex-row items-center gap-3 p-4">
      <PersonAvatar initials={lender.initials} className="size-10" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-semibold">{lender.name}</p>
        <p className="truncate text-[13px] text-muted-foreground">
          {lender.verified ? "ID verified · " : ""}
          {lender.rentals} rentals
        </p>
      </div>
      {listing.lenderId !== "me" && (
        <Button variant="ghost" size="icon" aria-label={`Message ${lender.name}`} onClick={() => message(listing.lenderId, listing.id, context, "renting")}>
          <MessageSquare />
        </Button>
      )}
    </Panel>
  )
}

export function NotFound({ what = "outfit", href = "/browse", cta = "Browse outfits" }: { what?: string; href?: string; cta?: string }) {
  return (
    <EmptyState icon={Shirt} title={`We couldn't find that ${what}`} description="It may have been removed, or the link is out of date.">
      <LinkButton href={href} variant="outline">
        {cta}
      </LinkButton>
    </EmptyState>
  )
}

export function rentalBadge(r: Rental): { label: string; variant: "success" | "warning" | "outline" | "secondary" | "destructive"; clock?: boolean } {
  const today = todayISO()
  switch (r.status) {
    case "requested":
      return { label: "Awaiting lender", variant: "warning" }
    case "confirmed":
      return r.start === today ? { label: "Pickup today", variant: "warning", clock: true } : { label: "Confirmed", variant: "success" }
    case "active":
      if (r.end === today) return { label: "Return due today", variant: "warning", clock: true }
      return r.end < today ? { label: "Return overdue", variant: "destructive", clock: true } : { label: "Active", variant: "success" }
    case "cancelled":
      return { label: "Cancelled", variant: "outline" }
    default:
      return { label: "Completed", variant: "secondary" }
  }
}

/** Index of the current step in RENTAL_STEPS for a rental. */
export function rentalStep(r: Rental) {
  return { requested: 1, confirmed: 2, active: 3, returned: 4, completed: 5, cancelled: 1 }[r.status]
}

export function RentalSummaryCard({ rental, listing }: { rental: Rental; listing: Listing }) {
  const s = useApp()
  const lender = personFor(s, listing.lenderId)
  return (
    <Panel className="gap-4">
      <h2 className="text-base font-semibold">Rental summary</h2>
      <ListingSummary listing={listing} subtitle={`Size ${listing.size} · ${lender.name}`} />
      <Separator />
      <div className="flex flex-col gap-2.5">
        <Row label="Dates" value={range(rental.start, rental.end)} />
        <Row label={rental.status === "requested" ? "Total on acceptance" : "Paid"} value={money(rental.total)} />
        <Row label="Deposit hold" value={rental.status === "returned" || rental.status === "completed" ? `${money(rental.deposit)} released` : money(rental.deposit)} />
      </div>
    </Panel>
  )
}

export const PHOTO_SLOTS: { key: PhotoKey; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "label", label: "Label" },
  { key: "wear", label: "Existing wear" },
]

/** Read-only condition photos. Falls back to the listing's own photos, and to a line of text when there are none. */
export function PhotoRecord({
  photos,
  fallback,
  empty,
}: {
  photos: Partial<Record<PhotoKey, string>>
  fallback?: Partial<Record<PhotoKey, string>>
  empty: string
}) {
  const shown = PHOTO_SLOTS.map((p) => ({ ...p, src: photos[p.key] ?? fallback?.[p.key] })).filter((p) => p.src)
  if (shown.length === 0) return <p className="text-[13px] text-muted-foreground">{empty}</p>
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {shown.map((p) => (
        <Photo key={p.key} src={p.src} alt={p.label} className="h-[120px] rounded-[10px]">
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground">{p.label}</span>
        </Photo>
      ))}
    </div>
  )
}
