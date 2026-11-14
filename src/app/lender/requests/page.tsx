"use client"

import { useState } from "react"
import { Calendar, Inbox, MapPin, MessageSquare, Shield } from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { EmptyState, Photo, PageTitle, Panel, PersonAvatar, Rating, SegTabs } from "@/components/kit"
import { handoffsFor, HandoffList, requestEarn, responseRate } from "@/components/lender-bits"
import { useMessage } from "@/components/rental-bits"
import { LenderShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { addDaysISO, fmt, money, range, rentalDays, timeAgo } from "@/lib/format"
import { actions, listingById, personFor } from "@/lib/store"
import type { LenderRequest } from "@/lib/types"

type Tab = "all" | "tryon" | "reservation" | "handled"
const DAY = 24 * 3600_000

function respondIn(r: LenderRequest) {
  const left = r.createdAt + DAY - Date.now()
  if (left <= 0) return "Response overdue"
  const hours = Math.floor(left / 3600_000)
  return hours >= 1 ? `Respond in ${hours}h` : `Respond in ${Math.max(1, Math.round(left / 60_000))}m`
}

function Requests() {
  const s = useApp()
  const message = useMessage()
  const [tab, setTab] = useState<Tab>("all")
  const pending = s.requests.filter((r) => r.status === "pending")
  const handled = s.requests.filter((r) => r.status !== "pending")
  const rows = (tab === "handled" ? handled : pending.filter((r) => tab === "all" || r.kind === tab)).sort((a, b) => b.createdAt - a.createdAt)
  const week = handoffsFor(s).filter((h) => h.date <= addDaysISO(8))
  const rate = responseRate(s)

  return (
    <>
      <PageTitle title="Requests" description="Accept or decline try-on and reservation requests." />
      <SegTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "all", label: `All (${pending.length})` },
          { value: "tryon", label: `Try-ons (${pending.filter((r) => r.kind === "tryon").length})` },
          { value: "reservation", label: `Reservations (${pending.filter((r) => r.kind === "reservation").length})` },
          { value: "handled", label: "Handled" },
        ]}
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          {rows.length === 0 && (
            <EmptyState icon={Inbox} title={tab === "handled" ? "Nothing handled yet" : "No requests waiting"} description={tab === "handled" ? "Requests you accept or decline are kept here." : "New try-on and reservation requests will appear here."} />
          )}
          {rows.map((r) => {
            const listing = listingById(s, r.listingId)
            if (!listing) return null
            const renter = personFor(s, r.renterId)
            const tryOn = r.kind === "tryon"
            const open = () => message(r.renterId, r.listingId, tryOn ? "Try-on" : "Request", "lending")
            return (
              <Panel key={r.id} className="gap-4 p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <PersonAvatar initials={renter.initials} className="size-10" />
                  <div className="flex min-w-[220px] flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold">{renter.name}</p>
                      <Badge variant={tryOn ? "secondary" : "outline"}>{tryOn ? "Try-on" : "Reservation"}</Badge>
                      {renter.verified && (
                        <Badge variant="outline">
                          <Shield /> ID verified
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <Rating value={renter.rating} className="text-foreground" />
                      {renter.rentals} {renter.rentals === 1 ? "rental" : "rentals"} · Requested {timeAgo(r.createdAt)}{/^\d/.test(timeAgo(r.createdAt)) ? " ago" : ""}
                    </div>
                  </div>
                  {r.status === "pending" ? (
                    <p className="text-[13px] font-medium text-muted-foreground">{respondIn(r)}</p>
                  ) : (
                    <Badge variant={r.status === "declined" ? "outline" : "success"}>{r.status === "accepted" ? "Accepted" : r.status === "completed" ? "Completed" : "Declined"}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 rounded-[10px] border bg-subtle p-4">
                  <Photo src={listing.photos[0]} alt={listing.title} className="h-16 w-[52px] shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="truncate text-sm font-semibold">{listing.title}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-3.5" />
                        {tryOn ? `${fmt(r.start)} · ${r.time}` : `${range(r.start, r.end!)} · ${rentalDays(r.start, r.end!)} days`}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" /> {r.place}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <p className="text-xs text-muted-foreground">{tryOn ? "Try-on" : "You earn"}</p>
                    <p className="text-sm font-semibold">{tryOn ? "Free" : money(requestEarn(listing, r))}</p>
                  </div>
                </div>
                {r.message && <p className="text-sm leading-normal text-muted-foreground">“{r.message}”</p>}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={open}>
                      <MessageSquare /> Message
                    </Button>
                    {r.status === "pending" && (
                      <Button variant="ghost" onClick={open}>Suggest another time</Button>
                    )}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          actions.respondRequest(r.id, false)
                          toast.success(`Declined ${renter.name}’s request`)
                        }}
                      >
                        Decline
                      </Button>
                      <Button
                        onClick={() => {
                          actions.respondRequest(r.id, true)
                          toast.success(tryOn ? `Try-on with ${renter.name} confirmed` : `Reservation accepted — ${money(requestEarn(listing, r))} pending`)
                        }}
                      >
                        Accept
                      </Button>
                    </div>
                  )}
                </div>
              </Panel>
            )
          })}
        </div>
        <aside className="flex flex-col gap-4">
          <Panel>
            <h2 className="text-base font-semibold">This week</h2>
            <HandoffList items={week} showRenter={false} />
          </Panel>
          <Panel className="gap-2">
            <p className="text-[13px] font-medium text-muted-foreground">Response rate</p>
            <p className="text-[28px] leading-tight font-semibold tracking-[-0.56px]">{rate === null ? "–" : `${rate}%`}</p>
            <p className="text-[13px] leading-normal text-muted-foreground">
              Share of requests you’ve answered within 24 hours. Fast replies help renters plan, so answer even if it’s a no.
            </p>
          </Panel>
        </aside>
      </div>
    </>
  )
}

export default function RequestsPage() {
  return (
    <LenderShell>
      <Requests />
    </LenderShell>
  )
}
