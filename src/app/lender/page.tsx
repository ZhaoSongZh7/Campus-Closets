"use client"

import { useState } from "react"
import Link from "next/link"
import { DollarSign, Inbox, Leaf, Plus, Shirt, Star, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { useAccount, useApp } from "@/components/app-provider"
import { Photo, LinkButton, PageTitle, Panel, PanelHeader, PersonAvatar, SegTabs } from "@/components/kit"
import { EarningsChart, handoffsFor, HandoffList, monthlyEarnings, requestEarn, yearlyEarnings } from "@/components/lender-bits"
import { LenderShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { addDaysISO, compactRange, fmt, money } from "@/lib/format"
import { actions, isRentedNow, listingById, personFor } from "@/lib/store"

function Stat({ label, icon: Icon, value, note }: { label: string; icon: LucideIcon; value: string; note: string }) {
  return (
    <Panel className="gap-2">
      <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
        {label}
        <Icon className="size-4" />
      </div>
      <p className="text-[28px] leading-tight font-semibold tracking-[-0.56px]">{value}</p>
      <p className="text-[13px] text-muted-foreground">{note}</p>
    </Panel>
  )
}

function Overview() {
  const s = useApp()
  const account = useAccount()
  const [period, setPeriod] = useState<"month" | "year">("month")
  const mine = s.listings.filter((l) => l.lenderId === "me")
  const months = monthlyEarnings(s.transactions, 12)
  const thisMonth = months[11]!.value
  const lastMonth = months[10]!.value
  const change = lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0
  const handoffs = handoffsFor(s)
  const returnsThisWeek = handoffs.filter((h) => h.kind === "Return" && h.date <= addDaysISO(7)).length
  const pending = s.requests.filter((r) => r.status === "pending")
  const tryOns = pending.filter((r) => r.kind === "tryon").length
  const rated = mine.filter((l) => l.reviewCount > 0)
  const reviewCount = rated.reduce((n, l) => n + l.reviewCount, 0)
  const rating = reviewCount ? rated.reduce((n, l) => n + l.rating * l.reviewCount, 0) / reviewCount : 0
  const top = [...mine].filter((l) => l.rentals > 0).sort((a, b) => b.rentals - a.rentals).slice(0, 3)
  const totalRentals = mine.reduce((n, l) => n + l.rentals, 0)

  return (
    <>
      <PageTitle title="Lender overview" description={`Welcome back, ${account.firstName}. Here’s how your closet is doing.`}>
        <LinkButton href="/lender/closet/new">
          <Plus /> List an item
        </LinkButton>
      </PageTitle>

      {mine.length === 0 && (
        <Panel className="flex-row flex-wrap items-center gap-4 bg-subtle">
          <div className="flex min-w-[240px] flex-1 flex-col gap-1">
            <p className="text-sm font-semibold">List your first outfit</p>
            <p className="text-[13px] text-muted-foreground">
              Your listings are saved to your account and visible to everyone browsing. Requests from renters show up here
              and under Requests as soon as someone asks to try on or reserve an outfit.
            </p>
          </div>
          <LinkButton href="/lender/closet/new">
            <Plus /> List an item
          </LinkButton>
        </Panel>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Earned this month" icon={DollarSign} value={money(thisMonth)} note={lastMonth ? `${change >= 0 ? "+" : ""}${change}% vs. last month` : "After platform fee"} />
        <Stat label="Active rentals" icon={Shirt} value={String(mine.filter(isRentedNow).length)} note={`${returnsThisWeek} ${returnsThisWeek === 1 ? "return" : "returns"} due this week`} />
        <Stat label="Pending requests" icon={Inbox} value={String(pending.length)} note={`${tryOns} ${tryOns === 1 ? "try-on" : "try-ons"} · ${pending.length - tryOns} ${pending.length - tryOns === 1 ? "reservation" : "reservations"}`} />
        <Stat label="Average rating" icon={Star} value={rating ? rating.toFixed(1) : "–"} note={`From ${reviewCount} ratings`} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader title="Earnings" description={period === "month" ? "After platform fee · last 12 months" : "After platform fee · by year"}>
            <SegTabs value={period} onChange={setPeriod} items={[{ value: "month", label: "Month" }, { value: "year", label: "Year" }]} />
          </PanelHeader>
          <EarningsChart data={period === "month" ? months : yearlyEarnings(s.transactions)} />
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Upcoming handoffs</h2>
            <Link href="/lender/requests" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          <HandoffList items={handoffs.slice(0, 4)} />
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader title="Requests waiting on you" description="Respond within 24 hours.">
            <LinkButton href="/lender/requests" variant="outline">View all</LinkButton>
          </PanelHeader>
          {pending.length === 0 && <p className="text-sm text-muted-foreground">You’re all caught up — no requests are waiting.</p>}
          {pending.slice(0, 3).map((r, i) => {
            const listing = listingById(s, r.listingId)
            if (!listing) return null
            const renter = personFor(s, r.renterId)
            return (
              <div key={r.id} className="flex flex-col gap-5">
                {i > 0 && <Separator />}
                <div className="flex flex-wrap items-center gap-3">
                  <PersonAvatar initials={renter.initials} />
                  <div className="flex min-w-[180px] flex-1 flex-col gap-0.5">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {renter.name}
                      <Badge variant={r.kind === "tryon" ? "secondary" : "outline"}>{r.kind === "tryon" ? "Try-on" : "Reservation"}</Badge>
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {listing.title} · {r.kind === "tryon" ? `${fmt(r.start)} · ${r.time}` : `${compactRange(r.start, r.end!)} · You earn ${money(requestEarn(listing, r))}`}
                    </p>
                  </div>
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
                      toast.success(`Accepted ${renter.name}’s ${r.kind === "tryon" ? "try-on" : "reservation"}`)
                    }}
                  >
                    Accept
                  </Button>
                </div>
              </div>
            )
          })}
        </Panel>
        <Panel>
          <PanelHeader title="Top listings" description="By completed rentals" />
          {top.length === 0 && <p className="text-sm text-muted-foreground">Your most-rented outfits will show up here.</p>}
          {top.map((l) => (
            <Link key={l.id} href={`/listing/${l.id}`} className="group flex items-center gap-3">
              <Photo src={l.photos[0]} alt={l.title} className="h-12 w-10 shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-sm font-semibold group-hover:underline">{l.title}</p>
                <p className="text-[13px] text-muted-foreground">{l.rentals} rentals · {l.rating.toFixed(1)}</p>
              </div>
            </Link>
          ))}
          <Separator />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Leaf className="size-3.5 shrink-0" /> Your closet has been rented {totalRentals} times instead of sitting unworn.
          </p>
        </Panel>
      </div>
    </>
  )
}

export default function LenderOverviewPage() {
  return (
    <LenderShell>
      <Overview />
    </LenderShell>
  )
}
