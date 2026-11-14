"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { cn } from "cn"
import { Calendar, Check, ChevronRight, Clock, Droplet, Heart, MapPin, MessageSquare, Shield, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { DateField, Field, Photo, InfoRow, LinkButton, Panel, PersonAvatar, Rating, Row, SegTabs } from "@/components/kit"
import { ListingCard } from "@/components/listing-card"
import { NotFound, useMessage } from "@/components/rental-bits"
import { MapArt } from "@/components/map-art"
import { AppShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { addDaysISO, money, overlaps, quote, rentalDays, todayISO, whereLabel } from "@/lib/format"
import { actions, currentAccount, listingById, personFor } from "@/lib/store"
import type { Listing } from "@/lib/types"

const CONDITION = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "label", label: "Label" },
  { key: "wear", label: "Detail" },
] as const

function Gallery({ listing }: { listing: Listing }) {
  const photos = [...listing.photos, ...CONDITION.map((c) => listing.condition[c.key]).filter((p): p is string => Boolean(p))]
  const [index, setIndex] = useState(0)
  const main = photos[Math.min(index, Math.max(0, photos.length - 1))]
  // Only as many thumbnails as there are extra photos.
  const thumbs = [1, 2, 3].filter((i) => photos[i])
  return (
    <div className={cn("grid gap-3", thumbs.length > 0 && "sm:grid-cols-[1fr_170px]")}>
      <Photo label="Main outfit photo" src={main} alt={listing.title} fit="contain" className="h-[360px] sm:h-[520px]" />
      {thumbs.length > 0 && (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-1">
        {thumbs.map((i) => {
          const extra = photos.length - 4
          return (
            <button
              key={i}
              type="button"
              disabled={!photos[i]}
              onClick={() => setIndex(index === i ? 0 : i)}
              aria-label={`Show photo ${i + 1}`}
              className="min-h-[100px] rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Photo
                src={index === i ? photos[0] : photos[i]}
                alt={`Photo ${i + 1} of ${listing.title}`}
                className="size-full"
              >
                {i === 3 && extra > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-sm font-medium text-background">
                    +{extra} photos
                  </span>
                )}
              </Photo>
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}

function Detail({ listing }: { listing: Listing }) {
  const s = useApp()
  const router = useRouter()
  const message = useMessage()
  const account = currentAccount(s)
  const lender = personFor(s, listing.lenderId)
  const mine = listing.lenderId === "me"
  const reviews = s.reviews.filter((r) => r.listingId === listing.id)
  const [showAll, setShowAll] = useState(false)
  const [tab, setTab] = useState("details")
  const [start, setStart] = useState<string | undefined>(addDaysISO(3))
  const [end, setEnd] = useState<string | undefined>(addDaysISO(3 + Math.max(3, listing.minDays)))
  const saved = s.favorites.includes(listing.id)

  const days = start && end ? rentalDays(start, end) : 0
  const q = quote(listing.pricePerDay, days, listing.cleaningFee)
  const problem = !start || !end
    ? "Choose your rental dates."
    : end <= start
      ? "The end date needs to be after the start date."
      : days < listing.minDays
        ? `This outfit has a ${listing.minDays}-day minimum.`
        : listing.booked.some((b) => overlaps(start, end, b.start, b.end))
          ? "Those dates overlap another booking. Try different dates."
          : ""

  const similar = s.listings
    .filter((l) => l.id !== listing.id && l.status === "listed" && l.lenderId !== "me")
    .map((l) => ({ l, score: (l.category === listing.category ? 2 : 0) + l.occasions.filter((o) => listing.occasions.includes(o)).length }))
    .sort((a, b) => b.score - a.score || (a.l.distance ?? 1e6) - (b.l.distance ?? 1e6))
    .slice(0, 4)
    .map((x) => x.l)

  const jump = (value: string) => {
    setTab(value)
    document.getElementById(value)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link href="/browse" className="hover:text-foreground">Browse</Link>
        <ChevronRight className="size-3" />
        <Link href={`/browse?q=${encodeURIComponent(listing.category)}`} className="hover:text-foreground">{listing.category}</Link>
        <ChevronRight className="size-3" />
        <span className="font-medium text-foreground">{listing.title}</span>
      </nav>

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Gallery listing={listing} />
          <SegTabs
            value={tab}
            onChange={jump}
            items={[
              { value: "details", label: "Details" },
              { value: "condition", label: "Condition photos" },
              { value: "policies", label: "Policies" },
              { value: "reviews", label: `Reviews (${reviews.length})` },
            ]}
          />

          <section id="details" className="flex scroll-mt-24 flex-col gap-3">
            <h2 className="text-xl font-semibold">About this outfit</h2>
            <p className="text-[15px] leading-normal text-muted-foreground">{listing.description}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Size", `${listing.size}${listing.sizeNote ? ` (${listing.sizeNote})` : ""}`],
                ["Brand", listing.brand || "—"],
                ["Color", listing.color || "—"],
                ["Fit notes", listing.fit || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 rounded-[10px] border bg-subtle p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {[...listing.occasions, ...listing.styles].map((t) => (
                <Badge key={t} variant="secondary">{t}</Badge>
              ))}
            </div>
          </section>
          <Separator />

          <section id="condition" className="flex scroll-mt-24 flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Condition photos</h2>
              {listing.rentals > 0 && (
                <Badge variant="outline">
                  <Check /> Verified at last return
                </Badge>
              )}
            </div>
            {CONDITION.some((c) => listing.condition[c.key]) ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {CONDITION.filter((c) => listing.condition[c.key]).map((c) => (
                  <figure key={c.key} className="flex flex-col gap-2">
                    <Photo src={listing.condition[c.key]} alt={`${c.label} of ${listing.title}`} className="h-[150px]" />
                    <figcaption className="text-[13px] font-medium">{c.label}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">The lender hasn’t added condition photos yet. Ask for them in a message, or check the outfit at a try-on.</p>
            )}
          </section>
          <Separator />

          <section id="policies" className="flex scroll-mt-24 flex-col gap-4">
            <h2 className="text-xl font-semibold">Cleaning &amp; damage policy</h2>
            <div className="grid gap-5 md:grid-cols-2">
              <InfoRow
                icon={Droplet}
                title="Cleaning"
                text={listing.cleaningIncluded ? `The lender cleans after each rental. A ${money(listing.cleaningFee)} cleaning fee is added to your total.` : "You clean before returning it. Follow the lender's care notes."}
              />
              <InfoRow icon={Clock} title="Late returns" text={`Late returns are charged ${money(listing.pricePerDay)} for each extra day started.`} />
              <InfoRow icon={Shield} title="Damage" text={`A ${money(listing.deposit)} refundable deposit covers damage beyond normal wear, judged against the pickup photos.`} />
              <InfoRow icon={Undo2} title="Cancellation" text="Free cancellation up to 48 hours before pickup." />
            </div>
            {listing.careNotes && <p className="rounded-[10px] bg-subtle p-4 text-sm leading-normal text-muted-foreground">“{listing.careNotes}”</p>}
          </section>
          <Separator />

          <section id="reviews" className="flex scroll-mt-24 flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Reviews</h2>
              <Rating value={listing.rating} count={listing.reviewCount} />
            </div>
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No written reviews yet. Reviews appear after a completed rental.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {(showAll ? reviews : reviews.slice(0, 2)).map((r) => (
                  <Panel key={r.id} className="gap-3 p-5">
                    <div className="flex items-center gap-3">
                      <PersonAvatar initials={r.initials} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <p className="truncate text-sm font-semibold">{r.author}</p>
                        <p className="truncate text-[13px] text-muted-foreground">{r.context}</p>
                      </div>
                      <Rating value={r.rating} />
                    </div>
                    <p className="text-sm leading-normal text-muted-foreground">{r.text}</p>
                  </Panel>
                ))}
              </div>
            )}
            {reviews.length > 2 && (
              <Button variant="outline" className="w-fit" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer reviews" : "Show all reviews"}
              </Button>
            )}
          </section>
          <Separator />

          <Panel className="flex-row flex-wrap items-center gap-4">
            <PersonAvatar initials={lender.initials} src={mine ? account?.avatar : undefined} className="size-14 text-base" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold">{lender.name}</p>
                {lender.verified && (
                  <Badge variant="outline">
                    <Shield /> ID verified
                  </Badge>
                )}
              </div>
              <p className="text-[13px] text-muted-foreground">
                {lender.rentals} rentals · {lender.replyTime} · Member since {lender.memberSince}
              </p>
            </div>
            {!mine && (
              <Button variant="outline" onClick={() => message(listing.lenderId, listing.id, "Request", "renting")}>
                <MessageSquare /> Message
              </Button>
            )}
            <LinkButton href={mine ? "/profile" : `/profile?id=${listing.lenderId}`} variant="outline">
              View closet
            </LinkButton>
          </Panel>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Panel className="gap-4">
            <div className="flex items-start justify-between">
              <p className="flex items-baseline gap-1.5">
                <span className="text-[28px] leading-none font-semibold">{money(listing.pricePerDay)}</span>
                <span className="text-sm text-muted-foreground">/ day</span>
              </p>
              <Button
                variant="outline"
                size="icon"
                aria-label={saved ? "Remove from saved" : "Save outfit"}
                aria-pressed={saved}
                onClick={() => {
                  if (!account) return router.push(`/login?next=/listing/${listing.id}`)
                  actions.toggleFavorite(listing.id)
                  toast.success(saved ? "Removed from saved outfits" : "Saved to your outfits")
                }}
              >
                <Heart className={cn(saved && "fill-foreground")} />
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold">{listing.title}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Size {listing.size} · {mine ? "Your listing" : whereLabel(listing)}
                <Rating value={listing.rating} className="text-foreground" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {listing.tryOn && (
                <Badge variant="outline">
                  <Check /> Try-on available
                </Badge>
              )}
              {listing.cleaningIncluded && <Badge variant="secondary">Cleaning included</Badge>}
              {listing.status !== "listed" && <Badge variant="warning">{listing.status === "draft" ? "Draft" : "Paused"}</Badge>}
            </div>
            <Separator />
            {mine ? (
              <>
                <p className="text-sm leading-normal text-muted-foreground">This is your listing. Renters see it like this, with their own dates and total.</p>
                <LinkButton href={`/lender/closet/new?edit=${listing.id}`} size="lg">Edit listing</LinkButton>
                <LinkButton href="/lender/closet" variant="outline" size="lg">Manage in my closet</LinkButton>
              </>
            ) : (
              <>
                <Field label="Rental dates">
                  <div className="grid grid-cols-2 gap-2">
                    <DateField value={start} onChange={setStart} min={todayISO()} pattern="MMM d" placeholder="Start" />
                    <DateField value={end} onChange={setEnd} min={start ?? todayISO()} pattern="MMM d" placeholder="End" />
                  </div>
                </Field>
                {days > 0 && !problem && (
                  <div className="flex flex-col gap-3">
                    <Row label={`${money(listing.pricePerDay)} × ${days} ${days === 1 ? "day" : "days"}`} value={money(q.subtotal)} />
                    {q.cleaningFee > 0 && <Row label="Cleaning fee" value={money(q.cleaningFee)} />}
                    <Row label="Service fee" value={money(q.serviceFee)} />
                    <Separator />
                    <Row strong label="Total" value={money(q.total)} />
                    <p className="text-xs text-muted-foreground">+ {money(listing.deposit)} refundable deposit hold</p>
                  </div>
                )}
                {problem && <p role="alert" className="text-[13px] text-destructive">{problem}</p>}
                <Button
                  size="lg"
                  disabled={Boolean(problem)}
                  onClick={() => router.push(`/listing/${listing.id}/reserve?start=${start}&end=${end}`)}
                >
                  Reserve outfit
                </Button>
                {listing.tryOn && (
                  <LinkButton href={`/listing/${listing.id}/try-on`} variant="outline" size="lg">
                    <Calendar /> Book a try-on first
                  </LinkButton>
                )}
                <p className="text-center text-xs text-muted-foreground">You won’t be charged until the lender accepts.</p>
              </>
            )}
          </Panel>
          <Panel className="gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="size-4" /> Pickup area · {listing.pickupArea}
            </p>
            <MapArt seed={listing.pickupArea || listing.id} label={listing.pickupArea} className="h-[150px]" />
            <p className="text-[13px] text-muted-foreground">Exact address is shared after booking.</p>
          </Panel>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="flex flex-col gap-6 pt-6">
          <h2 className="text-[28px] leading-tight font-semibold tracking-[-0.56px]">Similar outfits nearby</h2>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {similar.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function ListingRoute() {
  const s = useApp()
  const { id } = useParams<{ id: string }>()
  const listing = listingById(s, id)
  return listing ? <Detail key={listing.id} listing={listing} /> : <NotFound />
}

export default function ListingPage() {
  return (
    <AppShell>
      <ListingRoute />
    </AppShell>
  )
}
