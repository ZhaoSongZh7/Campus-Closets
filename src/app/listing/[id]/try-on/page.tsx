"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { cn } from "cn"
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isBefore, startOfDay, startOfMonth } from "date-fns"
import { ChevronLeft, ChevronRight, Clock } from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { BackLink, CheckLine, PageTitle, Panel, RadioCard, Row } from "@/components/kit"
import { LenderCard, ListingSummary, NotFound } from "@/components/rental-bits"
import { MapArt } from "@/components/map-art"
import { AppShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { fmt, iso, money, TIME_SLOTS, whereLabel } from "@/lib/format"
import { actions, listingById, personFor } from "@/lib/store"
import type { Listing, TryOn } from "@/lib/types"

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const DOW_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const PLACE_LABEL: Record<TryOn["place"], string> = { public: "Public spot", home: "Lender’s home", other: "To be agreed" }

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-base font-semibold">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
      {children}
    </h2>
  )
}

function BookTryOn({ listing }: { listing: Listing }) {
  const s = useApp()
  const router = useRouter()
  const lender = personFor(s, listing.lenderId)
  const today = startOfDay(new Date())
  const [month, setMonth] = useState(startOfMonth(today))
  const [date, setDate] = useState<string>()
  const [time, setTime] = useState<string>()
  const [place, setPlace] = useState<TryOn["place"]>("public")
  const [note, setNote] = useState("")

  const cells = useMemo(() => {
    const days = eachDayOfInterval({ start: month, end: endOfMonth(month) })
    return [...Array<null>(getDay(month)).fill(null), ...days]
  }, [month])
  const available = (d: Date) => !isBefore(d, today) && listing.days.includes(DOW_LONG[getDay(d)]!)

  const submit = () => {
    if (!date || !time) return
    actions.requestTryOn({ listingId: listing.id, date, time, place, note })
    toast.success(`Try-on requested with ${lender.name}`)
    router.push("/rentals?tab=tryons")
  }

  return (
    <>
      <BackLink href={`/listing/${listing.id}`}>Back to listing</BackLink>
      <PageTitle title="Book a try-on" description="Meet the lender, try the outfit on, then decide. It takes about 20 minutes and it’s free." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-6">
          <Panel>
            <StepTitle n={1}>Pick a day</StepTitle>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="icon" aria-label="Previous month" disabled={!isBefore(startOfMonth(today), month)} onClick={() => setMonth(addMonths(month, -1))}>
                <ChevronLeft />
              </Button>
              <p className="text-sm font-semibold" aria-live="polite">{format(month, "MMMM yyyy")}</p>
              <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {DOW.map((d) => (
                <span key={d} className="flex h-6 items-center justify-center text-xs font-medium text-muted-foreground">{d}</span>
              ))}
              {cells.map((d, i) => {
                if (!d) return <span key={`blank-${i}`} />
                const value = iso(d)
                const ok = available(d)
                const selected = value === date
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!ok}
                    aria-pressed={selected}
                    aria-label={format(d, "EEEE, MMMM d")}
                    onClick={() => setDate(value)}
                    className={cn(
                      "mx-auto flex size-10 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                      selected ? "bg-primary text-primary-foreground" : ok ? "hover:bg-muted" : "text-muted-foreground/40"
                    )}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">{lender.name.split(" ")[0]} is usually available on {listing.days.join(", ")}.</p>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between">
              <StepTitle n={2}>Pick a time</StepTitle>
              <Badge variant="outline">
                <Clock /> About 20 minutes
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={slot === time}
                  onClick={() => setTime(slot)}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                    slot === time ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {slot}
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <StepTitle n={3}>Where to meet</StepTitle>
            <div role="radiogroup" aria-label="Where to meet" className="flex flex-col gap-3">
              <RadioCard selected={place === "public"} onSelect={() => setPlace("public")} title="Lender’s suggested public spot" description={listing.distance === null ? listing.pickupArea || "Shared after the lender accepts" : `${listing.pickupArea} · ${whereLabel(listing)}`} />
              <RadioCard selected={place === "home"} onSelect={() => setPlace("home")} title="Lender’s home" description="Address shared after the lender accepts" />
              <RadioCard selected={place === "other"} onSelect={() => setPlace("other")} title="Suggest another place" description="Propose a spot that works for you both in your note" />
            </div>
            <MapArt seed={listing.pickupArea || listing.id} label={listing.pickupArea} className="h-40" />
          </Panel>

          <Panel>
            <StepTitle n={4}>Note to the lender</StepTitle>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note to the lender" placeholder="Optional. Share your event date, usual size, or questions." className="min-h-24" />
          </Panel>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Panel className="gap-4">
            <h2 className="text-base font-semibold">Try-on summary</h2>
            <ListingSummary listing={listing} subtitle={`Size ${listing.size} · ${money(listing.pricePerDay)} / day`} />
            <Separator />
            <div className="flex flex-col gap-2.5">
              <Row label="Date" value={date ? fmt(date) : "Pick a day"} />
              <Row label="Time" value={time ?? "Pick a time"} />
              <Row label="Place" value={PLACE_LABEL[place]} />
              <Row label="Try-on fee" value="Free" />
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <CheckLine>No commitment to rent</CheckLine>
              <CheckLine>Reserve after you’ve tried it on</CheckLine>
              <CheckLine>Free to cancel up to 2 hours before</CheckLine>
            </div>
            <Button size="lg" disabled={!date || !time} onClick={submit}>
              Request try-on
            </Button>
            <p className="text-center text-xs text-muted-foreground">The lender has 24 hours to confirm.</p>
          </Panel>
          <LenderCard listing={listing} context="Try-on" />
        </aside>
      </div>
    </>
  )
}

function Route() {
  const s = useApp()
  const { id } = useParams<{ id: string }>()
  const listing = listingById(s, id)
  if (!listing || listing.lenderId === "me" || !listing.tryOn) return <NotFound />
  return <BookTryOn listing={listing} />
}

export default function TryOnPage() {
  return (
    <AppShell auth>
      <Route />
    </AppShell>
  )
}
