"use client"

import { Suspense, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Clock, CreditCard, Droplet, Lock, Shield } from "lucide-react"

import { useAccount, useApp } from "@/components/app-provider"
import { BackLink, CheckItem, CheckLine, DateField, Field, InfoRow, PageTitle, Panel, PanelHeader, RadioCard, RENTAL_STEPS, Row, SimpleSelect, Stepper } from "@/components/kit"
import { ListingSummary, NotFound } from "@/components/rental-bits"
import { AppShell } from "@/components/site/shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { addDaysISO, fmt, fmtShort, money, overlaps, quote, rentalDays, TIME_SLOTS, toDate, todayISO, whereLabel } from "@/lib/format"
import { actions, listingById, personFor } from "@/lib/store"
import type { Listing, Rental } from "@/lib/types"

const isDate = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v))

function Reserve({ listing }: { listing: Listing }) {
  const s = useApp()
  const account = useAccount()
  const router = useRouter()
  const params = useSearchParams()
  const lender = personFor(s, listing.lenderId)
  const [start, setStart] = useState<string | undefined>(isDate(params.get("start")) ? params.get("start")! : addDaysISO(3))
  const [end, setEnd] = useState<string | undefined>(isDate(params.get("end")) ? params.get("end")! : addDaysISO(6))
  const [eventDate, setEventDate] = useState<string>()
  const [pickupTime, setPickupTime] = useState("5:30 PM")
  const [returnTime, setReturnTime] = useState("6:00 PM")
  const [place, setPlace] = useState<Rental["place"]>("public")
  const [agreePolicy, setAgreePolicy] = useState(false)
  const [agreePhotos, setAgreePhotos] = useState(false)
  const [useSaved, setUseSaved] = useState(Boolean(account.card))
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", zip: "" })
  const [saveCard, setSaveCard] = useState(false)
  const [error, setError] = useState("")

  const triedOn = s.tryOns.find((t) => t.listingId === listing.id && (t.status === "booked" || t.status === "done"))
  const days = start && end && end > start ? rentalDays(start, end) : 0
  const q = quote(listing.pricePerDay, days, listing.cleaningFee)
  const digits = card.number.replace(/\D/g, "")

  const validate = () => {
    if (!start || !end || end <= start) return "Choose a start date and a later end date."
    if (days < listing.minDays) return `This outfit has a ${listing.minDays}-day minimum.`
    if (listing.booked.some((b) => overlaps(start, end, b.start, b.end))) return "Those dates overlap another booking. Try different dates."
    if (!agreePolicy || !agreePhotos) return "Please confirm both policy checkboxes before reserving."
    if (!useSaved) {
      if (digits.length < 13 || digits.length > 19) return "Enter a valid card number."
      if (!/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/.test(card.expiry.trim())) return "Enter the card expiry as MM / YY."
      if (!/^\d{3,4}$/.test(card.cvc.trim())) return "Enter the 3 or 4 digit security code."
      if (!card.zip.trim()) return "Enter the card's billing ZIP code."
    }
    return ""
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validate()
    setError(problem)
    if (problem) return
    const id = actions.createReservation({
      listingId: listing.id,
      start: start!,
      end: end!,
      eventDate,
      pickupTime,
      returnTime,
      place,
      saveCard: !useSaved && saveCard ? digits.slice(-4) : undefined,
    })
    router.push(`/rentals/${id}/confirmed`)
  }

  return (
    <form onSubmit={submit} className="contents">
      <BackLink href={`/listing/${listing.id}`}>Back to listing</BackLink>
      <PageTitle title="Reserve your outfit" description="Review dates, handoff details, and policies. You’re only charged if the lender accepts." />
      <Panel className="py-4">
        <Stepper steps={RENTAL_STEPS} current={1} />
      </Panel>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Rental dates" description={days ? `${days} ${days === 1 ? "day" : "days"} · price is per day` : "Price is per day"} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Start">
                <DateField value={start} onChange={setStart} min={todayISO()} />
              </Field>
              <Field label="End">
                <DateField value={end} onChange={setEnd} min={start ?? todayISO()} />
              </Field>
              <Field label="Event date (optional)">
                <DateField value={eventDate} onChange={setEventDate} min={start ?? todayISO()} placeholder="Add a date" />
              </Field>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Pickup & return" description="Both happen in person, near you." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pickup time">
                <SimpleSelect value={pickupTime} onChange={(v) => setPickupTime(v || pickupTime)} options={TIME_SLOTS.map((t) => ({ value: t, label: start ? `${fmt(start)} · ${t}` : t }))} />
              </Field>
              <Field label="Return time">
                <SimpleSelect value={returnTime} onChange={(v) => setReturnTime(v || returnTime)} options={TIME_SLOTS.map((t) => ({ value: t, label: end ? `${fmt(end)} · ${t}` : t }))} />
              </Field>
            </div>
            <div role="radiogroup" aria-label="Handoff place" className="flex flex-col gap-3">
              <RadioCard selected={place === "public"} onSelect={() => setPlace("public")} title="Meet at a public spot" description={listing.distance === null ? listing.pickupArea || "Shared after the lender accepts" : `${listing.pickupArea} · ${whereLabel(listing)}`} />
              <RadioCard selected={place === "home"} onSelect={() => setPlace("home")} title="Pick up at lender’s home" description="Address shared once the lender accepts" />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Cleaning & damage policy" description="Please read before reserving." />
            <InfoRow icon={Droplet} title="Cleaning" text={listing.cleaningIncluded ? `${lender.name.split(" ")[0]} cleans the outfit after your rental. The ${money(listing.cleaningFee)} cleaning fee is included in your total.` : "You’re responsible for cleaning before return. Follow the care notes on the listing."} />
            <InfoRow icon={Shield} title="Damage & deposit" text={`A ${money(listing.deposit)} deposit hold is placed when the lender accepts and released after the return check. It covers damage beyond normal wear.`} />
            <InfoRow icon={Clock} title="Late returns" text={`Late returns are charged ${money(listing.pricePerDay)} for each extra day started.`} />
            <Separator />
            <CheckItem checked={agreePolicy} onChange={setAgreePolicy}>I’ve read and agree to the cleaning and damage policy</CheckItem>
            <CheckItem checked={agreePhotos} onChange={setAgreePhotos}>I’ll take condition photos at pickup and return</CheckItem>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Payment</h2>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Secure payment
              </span>
            </div>
            <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted-foreground">
              Demo checkout: no payment processor is connected, so nothing is charged and card details are never stored or sent anywhere.
            </p>
            {account.card && (
              <div role="radiogroup" aria-label="Payment method" className="flex flex-col gap-3">
                <RadioCard selected={useSaved} onSelect={() => setUseSaved(true)} title={`Card •••• ${account.card.last4}`} description="Saved card" />
                <RadioCard selected={!useSaved} onSelect={() => setUseSaved(false)} title="Use a different card" description="Enter new card details" />
              </div>
            )}
            {!useSaved && (
              <>
                <Field label="Card number">
                  <span className="relative">
                    <CreditCard className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} inputMode="numeric" autoComplete="cc-number" placeholder="1234 1234 1234 1234" className="pl-9" />
                  </span>
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Expiry">
                    <Input value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} autoComplete="cc-exp" placeholder="MM / YY" />
                  </Field>
                  <Field label="CVC">
                    <Input value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} inputMode="numeric" autoComplete="cc-csc" placeholder="CVC" />
                  </Field>
                  <Field label="ZIP">
                    <Input value={card.zip} onChange={(e) => setCard({ ...card, zip: e.target.value })} autoComplete="postal-code" placeholder="ZIP code" />
                  </Field>
                </div>
                <CheckItem checked={saveCard} onChange={setSaveCard}>Save card for future rentals (last 4 digits only)</CheckItem>
              </>
            )}
          </Panel>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Panel className="gap-4">
            <h2 className="text-base font-semibold">Order summary</h2>
            <ListingSummary listing={listing} subtitle={`Size ${listing.size} · ${lender.name}`} />
            <Separator />
            <div className="flex flex-col gap-2.5">
              <Row label={`${money(listing.pricePerDay)} × ${days} ${days === 1 ? "day" : "days"}`} value={money(q.subtotal)} />
              {q.cleaningFee > 0 && <Row label="Cleaning fee" value={money(q.cleaningFee)} />}
              <Row label="Service fee" value={money(q.serviceFee)} />
              <Separator />
              <Row strong label="Total due on acceptance" value={money(days ? q.total : 0)} />
              <Row label="Refundable deposit hold" value={money(listing.deposit)} />
            </div>
            {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
            <Button type="submit" size="lg">Request to reserve</Button>
            <p className="text-center text-xs text-muted-foreground">You won’t be charged until the lender accepts.</p>
          </Panel>
          <Panel className="gap-2.5">
            {triedOn && <CheckLine>Tried on {fmtShort(triedOn.date)} — fit confirmed</CheckLine>}
            {start && <CheckLine>Free cancellation until {fmtShort(addDaysISO(-2, toDate(start)))}</CheckLine>}
            <CheckLine>Deposit released after return check</CheckLine>
          </Panel>
        </aside>
      </div>
    </form>
  )
}

function Route() {
  const s = useApp()
  const { id } = useParams<{ id: string }>()
  const listing = listingById(s, id)
  if (!listing || listing.lenderId === "me" || listing.status !== "listed") return <NotFound />
  return <Reserve listing={listing} />
}

export default function ReservePage() {
  return (
    <AppShell auth>
      <Suspense>
        <Route />
      </Suspense>
    </AppShell>
  )
}
