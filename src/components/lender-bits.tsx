"use client"

import { useState } from "react"
import { cn } from "cn"
import { format, subMonths } from "date-fns"
import { Calendar, ShoppingBag, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { IconTile } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { lenderEarn, money, relDay, rentalDays, todayISO } from "@/lib/format"
import { actions, listingById, personFor } from "@/lib/store"
import type { LenderRequest, Listing, State, Transaction } from "@/lib/types"

export type Handoff = {
  key: string
  request: LenderRequest
  kind: "Return" | "Pickup" | "Try-on"
  listing: Listing
  date: string
  time: string
  renter: string
}

/** Upcoming in-person meetings for the lender, soonest first. */
export function handoffsFor(s: State): Handoff[] {
  const out: Handoff[] = []
  const today = todayISO()
  for (const r of s.requests) {
    if (r.status !== "accepted") continue
    const listing = listingById(s, r.listingId)
    if (!listing) continue
    const renter = personFor(s, r.renterId).name
    if (r.kind === "tryon") {
      out.push({ key: `${r.id}-t`, request: r, kind: "Try-on", listing, date: r.start, time: r.time, renter })
    } else {
      if (r.start >= today) out.push({ key: `${r.id}-p`, request: r, kind: "Pickup", listing, date: r.start, time: r.time, renter })
      out.push({ key: `${r.id}-r`, request: r, kind: "Return", listing, date: r.end ?? r.start, time: r.returnTime ?? r.time, renter })
    }
  }
  return out.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))
}

export function requestEarn(listing: Listing, r: LenderRequest) {
  if (r.kind !== "reservation" || !r.end) return 0
  return lenderEarn(listing.pricePerDay * rentalDays(r.start, r.end)).earn
}

const ICONS = { Return: Undo2, Pickup: ShoppingBag, "Try-on": Calendar }

export function HandoffList({ items, showRenter = true }: { items: Handoff[]; showRenter?: boolean }) {
  const today = todayISO()
  if (!items.length) return <p className="text-sm text-muted-foreground">No handoffs coming up.</p>
  return (
    <ul className="flex flex-col gap-3">
      {items.map((h, i) => {
        // The lender closes out a try-on or a rental once the meeting has happened.
        const closable = h.kind === "Return" ? h.request.start <= today : h.kind === "Try-on" && h.date <= today
        return (
          <li key={h.key} className="flex flex-col gap-3">
            {i > 0 && <Separator />}
            <div className="flex items-center gap-3">
              <IconTile icon={ICONS[h.kind]} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-sm font-semibold">{h.listing.title}</p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {relDay(h.date)} · {h.time}
                  {showRenter && ` · ${h.renter}`}
                </p>
              </div>
              {closable ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    actions.completeRequest(h.request.id)
                    toast.success(h.kind === "Return" ? `${h.listing.title} marked as returned. Earnings are now available.` : "Try-on marked as done")
                  }}
                >
                  {h.kind === "Return" ? "Mark returned" : "Mark done"}
                </Button>
              ) : (
                <Badge variant="secondary">{h.kind}</Badge>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Earnings per calendar month for the last `months` months, oldest first. */
export function monthlyEarnings(transactions: Transaction[], months: number) {
  const now = new Date()
  return Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i)
    const key = format(d, "yyyy-MM")
    return {
      key,
      label: format(d, "MMM"),
      full: format(d, "MMMM yyyy"),
      value: transactions.filter((t) => t.date.startsWith(key)).reduce((n, t) => n + t.earn, 0),
    }
  })
}

export function yearlyEarnings(transactions: Transaction[]) {
  const byYear = new Map<string, number>()
  for (const t of transactions) byYear.set(t.date.slice(0, 4), (byYear.get(t.date.slice(0, 4)) ?? 0) + t.earn)
  return [...byYear.entries()].sort().map(([key, value]) => ({ key, label: key, full: key, value }))
}

/** Single-series bar chart: one neutral hue, hover/focus tooltip, screen-reader table. */
export function EarningsChart({ data }: { data: { key: string; label: string; full: string; value: number }[] }) {
  const [active, setActive] = useState<string | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  if (data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-[226px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No earnings yet. They appear here once a rental is returned.
      </div>
    )
  }
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex h-[200px] items-end gap-2 border-b" role="presentation">
        {data.map((d) => (
          <button
            key={d.key}
            type="button"
            aria-label={`${d.full}: ${money(d.value)}`}
            onMouseEnter={() => setActive(d.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(d.key)}
            onBlur={() => setActive(null)}
            className="group relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center outline-none"
          >
            {active === d.key && (
              <span
                className="pointer-events-none absolute z-10 -translate-y-2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-md"
                style={{ bottom: `${(d.value / max) * 100}%` }}
              >
                <span className="font-semibold">{money(d.value)}</span> <span className="text-muted-foreground">{d.full}</span>
              </span>
            )}
            <span
              className={cn(
                "w-full max-w-[45px] rounded-t-[4px] transition-colors",
                active === d.key ? "bg-primary" : "bg-primary/85",
                "group-focus-visible:ring-2 group-focus-visible:ring-ring"
              )}
              style={{ height: `${Math.max(d.value ? 2 : 0, (d.value / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="flex gap-2" aria-hidden="true">
        {data.map((d) => (
          <span key={d.key} className="min-w-0 flex-1 text-center text-[11px] text-muted-foreground">
            {d.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Earnings after platform fee</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Earned</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.full}</td>
              <td>{money(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const DAY_MS = 24 * 3600_000

/** Share of requests answered within 24h, out of everything answered or already overdue. */
export function responseRate(s: State): number | null {
  const handled = s.requests.filter((r) => r.status !== "pending")
  const overdue = s.requests.filter((r) => r.status === "pending" && Date.now() - r.createdAt > DAY_MS).length
  const onTime = handled.filter((r) => r.respondedAt !== undefined && r.respondedAt - r.createdAt <= DAY_MS).length
  return handled.length + overdue ? Math.round((onTime / (handled.length + overdue)) * 100) : null
}
