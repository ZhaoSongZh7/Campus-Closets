"use client"

import { useParams } from "next/navigation"
import { Calendar, Check, Inbox, MessageSquare, ShoppingBag, Undo2 } from "lucide-react"

import { useApp } from "@/components/app-provider"
import { InfoRow, LinkButton, Panel, Row } from "@/components/kit"
import { ListingSummary, NotFound, useMessage } from "@/components/rental-bits"
import { AppShell } from "@/components/site/shell"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { fmt, money, range } from "@/lib/format"
import { listingById, personFor } from "@/lib/store"
import type { Listing, Rental } from "@/lib/types"

/** Builds an .ics file with the pickup and return as two events. */
function downloadCalendar(rental: Rental, listing: Listing) {
  const stamp = (date: string, time: string) => {
    const m = time.match(/(\d+):(\d+)\s*(AM|PM)/i)!
    let hour = Number(m[1]) % 12
    if (m[3]!.toUpperCase() === "PM") hour += 12
    return `${date.replaceAll("-", "")}T${String(hour).padStart(2, "0")}${m[2]}00`
  }
  const event = (title: string, date: string, time: string) =>
    ["BEGIN:VEVENT", `UID:${rental.id}-${title.split(" ")[0]}@mutuari`, `DTSTART:${stamp(date, time)}`, "DURATION:PT30M", `SUMMARY:${title}: ${listing.title}`, `LOCATION:${listing.pickupArea}`, "END:VEVENT"].join("\r\n")
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mutuari//EN", event("Pickup", rental.start, rental.pickupTime), event("Return", rental.end, rental.returnTime), "END:VCALENDAR"].join("\r\n")
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${rental.code}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

function Confirmed() {
  const s = useApp()
  const message = useMessage()
  const { id } = useParams<{ id: string }>()
  const rental = s.rentals.find((r) => r.id === id)
  const listing = rental && listingById(s, rental.listingId)
  if (!rental || !listing) return <NotFound what="reservation" href="/rentals" cta="My rentals" />
  const lender = personFor(s, listing.lenderId)
  const accepted = rental.status !== "requested"

  return (
    <Panel className="mx-auto w-full max-w-[640px] items-center gap-6 p-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-success-muted text-success">
        <Check className="size-6" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.56px]">{accepted ? "Reservation confirmed" : "Reservation requested"}</h1>
        <p className="text-[15px] text-muted-foreground" aria-live="polite">
          {accepted
            ? `${lender.name} accepted your request. See you at pickup.`
            : `We’ve sent your request to ${lender.name}. The lender has 24 hours to accept.`}
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 rounded-xl border bg-subtle p-4 text-left">
        <ListingSummary listing={listing} subtitle={`Size ${listing.size} · ${lender.name}`} />
        <Separator />
        <Row label="Reservation" value={`#${rental.code}`} />
        <Row label="Dates" value={range(rental.start, rental.end)} />
        <Row label="Pickup" value={`${fmt(rental.start)} · ${rental.pickupTime}`} />
        <Row label="Total" value={money(rental.total)} />
      </div>
      <div className="flex w-full flex-col gap-4 text-left">
        <h2 className="text-base font-semibold">What happens next</h2>
        <InfoRow icon={Inbox} title="Lender accepts your request" text="You’ll be notified and charged then." />
        <InfoRow icon={ShoppingBag} title="Pick up in person" text="Check condition together and take photos." />
        <InfoRow icon={Undo2} title="Return on time" text="Deposit is released after the return check." />
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <Button variant="outline" className="h-10" onClick={() => message(listing.lenderId, listing.id, "Request", "renting")}>
          <MessageSquare /> Message lender
        </Button>
        <LinkButton href={`/rentals/${rental.id}`} className="h-10">
          View rental
        </LinkButton>
      </div>
      <button type="button" onClick={() => downloadCalendar(rental, listing)} className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        <Calendar className="size-3.5" /> Add pickup and return to calendar
      </button>
    </Panel>
  )
}

export default function ConfirmedPage() {
  return (
    <AppShell auth className="py-12">
      <Confirmed />
    </AppShell>
  )
}
