"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Camera, Check, Clock, Droplet, MessageSquare, Shield, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { BackLink, CheckItem, Field, InfoRow, LinkButton, PageTitle, Panel, PanelHeader, PhotoSlot, RENTAL_STEPS, SimpleSelect, Stepper } from "@/components/kit"
import { LenderCard, NotFound, PHOTO_SLOTS, PhotoRecord, RentalSummaryCard, rentalBadge, rentalStep, useMessage } from "@/components/rental-bits"
import { MapArt } from "@/components/map-art"
import { AppShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { fmt, money, range, TIME_SLOTS, todayISO } from "@/lib/format"
import { actions, listingById, personFor } from "@/lib/store"
import type { Listing, Rental } from "@/lib/types"

const CHECKLIST = ["Check the outfit together with the lender", "Confirm size and fit notes", "Take condition photos (below)"]

function RentalView({ rental, listing }: { rental: Rental; listing: Listing }) {
  const s = useApp()
  const router = useRouter()
  const message = useMessage()
  const lender = personFor(s, listing.lenderId)
  const badge = rentalBadge(rental)
  const place = rental.place === "public" ? listing.pickupArea : "Lender’s home"
  const [dialog, setDialog] = useState<"pickup" | "return" | "extend" | "issue" | "cancel" | null>(null)
  const [time, setTime] = useState("")
  const [extra, setExtra] = useState("1")
  const [issue, setIssue] = useState("")

  const awaiting = rental.status === "requested"
  const beforePickup = rental.status === "confirmed"
  const pickedUp = ["active", "returned", "completed"].includes(rental.status)
  const cancelled = rental.status === "cancelled"
  const photoCount = PHOTO_SLOTS.filter((p) => rental.pickupPhotos[p.key]).length
  const checklist = rental.pickupChecklist.map((v, i) => (i === 2 ? v || photoCount === 4 : v))
  const setCheck = (i: number, v: boolean) =>
    actions.updateRental(rental.id, { pickupChecklist: rental.pickupChecklist.map((x, j) => (j === i ? v : x)) })
  const close = () => setDialog(null)

  return (
    <>
      <BackLink href="/rentals">My rentals</BackLink>
      <PageTitle title={listing.title} description={`Reservation #${rental.code} · ${range(rental.start, rental.end)}`}>
        <div className="flex items-center gap-3">
          <Badge variant={badge.variant}>
            {badge.clock && <Clock />} {badge.label}
          </Badge>
          <Button variant="outline" onClick={() => message(listing.lenderId, listing.id, "Request", "renting")}>
            <MessageSquare /> Message lender
          </Button>
        </div>
      </PageTitle>
      <Panel className="py-4">
        <Stepper steps={RENTAL_STEPS} current={rentalStep(rental)} />
      </Panel>

      {awaiting && (
        <Panel className="flex-row flex-wrap items-center gap-4 border-warning/30 bg-warning-muted/40">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-semibold">Waiting for {lender.name} to accept</p>
            <p className="text-[13px] text-muted-foreground">You won’t be charged until they do. Lenders have 24 hours to respond.</p>
          </div>
          <Button variant="outline" onClick={() => setDialog("cancel")}>Cancel request</Button>
        </Panel>
      )}
      {cancelled && (
        <Panel className="flex-row flex-wrap items-center gap-4">
          <p className="flex-1 text-sm text-muted-foreground">This reservation was cancelled. Nothing was charged.</p>
          <LinkButton href={`/listing/${listing.id}`} variant="outline">Rent again</LinkButton>
        </Panel>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Pickup" description={`${fmt(rental.start)} · ${rental.pickupTime} · ${place}`}>
              {pickedUp ? (
                <Badge variant="success"><Check /> Picked up</Badge>
              ) : (
                !cancelled && (
                  <Button variant="outline" onClick={() => { setTime(rental.pickupTime); setDialog("pickup") }}>Reschedule</Button>
                )
              )}
            </PanelHeader>
            <div className="grid gap-4 md:grid-cols-[1fr_280px]">
              <MapArt seed={listing.pickupArea || listing.id} label={listing.pickupArea} className="h-[200px]" />
              <div className="flex flex-col justify-center gap-3 rounded-xl border bg-subtle p-6">
                <p className="text-sm font-semibold">Handoff code</p>
                <div className="flex gap-2" aria-label={`Handoff code ${awaiting ? "hidden until accepted" : rental.handoffCode.split("").join(" ")}`}>
                  {rental.handoffCode.split("").map((d, i) => (
                    <span key={i} className="flex h-14 w-12 items-center justify-center rounded-lg border bg-background text-2xl font-semibold">
                      {awaiting || cancelled ? "•" : d}
                    </span>
                  ))}
                </div>
                <p className="text-[13px] text-muted-foreground">{awaiting ? "Shown once the lender accepts." : "Show this to the lender at pickup."}</p>
              </div>
            </div>
            <Separator />
            <p className="text-sm font-semibold">Pickup checklist</p>
            {CHECKLIST.map((label, i) => (
              <CheckItem key={label} checked={checklist[i]!} disabled={!beforePickup} onChange={(v) => setCheck(i, v)}>
                {label}
              </CheckItem>
            ))}
            {beforePickup ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {PHOTO_SLOTS.map((p) => (
                  <PhotoSlot key={p.key} label={p.label} value={rental.pickupPhotos[p.key]} onChange={(v) => actions.setRentalPhoto(rental.id, "pickup", p.key, v)} />
                ))}
              </div>
            ) : (
              <PhotoRecord
                photos={rental.pickupPhotos}
                fallback={pickedUp ? listing.condition : undefined}
                empty={pickedUp ? "No photos were added at pickup." : "You can add condition photos once the lender accepts."}
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">Photos are time-stamped and shared with both sides.</p>
              {beforePickup && (
                <Button
                  disabled={!checklist.every(Boolean)}
                  onClick={() => {
                    actions.confirmPickup(rental.id)
                    toast.success("Pickup confirmed. Enjoy the outfit!")
                  }}
                >
                  <Check /> Confirm pickup
                </Button>
              )}
            </div>
            {beforePickup && rental.start > todayISO() && (
              <p className="text-xs text-muted-foreground">Pickup is scheduled for {fmt(rental.start)}. You can complete the checklist at the handoff.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Return" description={`${fmt(rental.end)} · ${rental.returnTime} · Same location`}>
              <Badge variant={rental.status === "active" && rental.end <= todayISO() ? "warning" : rental.status === "returned" || rental.status === "completed" ? "success" : "outline"}>
                {rental.status === "returned" || rental.status === "completed" ? "Returned" : rental.status === "active" && rental.end <= todayISO() ? "Due today" : "Upcoming"}
              </Badge>
            </PanelHeader>
            <div className="grid gap-5 md:grid-cols-2">
              <InfoRow icon={Droplet} title="Cleaning" text={listing.cleaningIncluded ? "The lender handles cleaning — just return it as worn." : listing.careNotes} />
              <InfoRow icon={Camera} title="Return photos" text="You’ll retake the same four photos." />
              <InfoRow icon={Clock} title="Running late?" text={`Message the lender. Late returns cost ${money(listing.pricePerDay)} per extra day started.`} />
              <InfoRow icon={Shield} title="Deposit" text={`${money(rental.deposit)} hold released after the return check.`} />
            </div>
            {!cancelled && rental.status !== "returned" && rental.status !== "completed" && (
              <div className="flex flex-wrap gap-3">
                {rental.status === "active" && <LinkButton href={`/rentals/${rental.id}/return`}>Start return</LinkButton>}
                <Button variant="outline" onClick={() => setDialog("extend")}>Extend rental</Button>
                <Button variant="outline" onClick={() => { setTime(rental.returnTime); setDialog("return") }}>Change return time</Button>
              </div>
            )}
            {(rental.status === "returned" || rental.status === "completed") && !rental.reviewed && (
              <LinkButton href={`/rentals/${rental.id}/return`} variant="outline" className="w-fit">Leave a review</LinkButton>
            )}
          </Panel>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <RentalSummaryCard rental={rental} listing={listing} />
          <LenderCard listing={listing} />
          <Panel className="gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <TriangleAlert className="size-4" /> Something wrong?
            </p>
            <p className="text-[13px] leading-normal text-muted-foreground">Report damage, a no-show, or a fit issue. We’ll share it with the lender along with your photos.</p>
            <Button variant="outline" onClick={() => setDialog("issue")}>Report an issue</Button>
          </Panel>
        </aside>
      </div>

      <Dialog open={dialog === "pickup" || dialog === "return"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "pickup" ? "Reschedule pickup" : "Change return time"}</DialogTitle>
            <DialogDescription>
              {dialog === "pickup" ? fmt(rental.start) : fmt(rental.end)} — the lender is notified of the new time.
            </DialogDescription>
          </DialogHeader>
          <Field label="New time">
            <SimpleSelect value={time} onChange={setTime} options={TIME_SLOTS} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button
              disabled={!time}
              onClick={() => {
                actions.updateRental(rental.id, dialog === "pickup" ? { pickupTime: time } : { returnTime: time })
                toast.success(dialog === "pickup" ? `Pickup moved to ${time}` : `Return moved to ${time}`)
                close()
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "extend"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend rental</DialogTitle>
            <DialogDescription>Extra days are charged at {money(listing.pricePerDay)} per day plus the service fee.</DialogDescription>
          </DialogHeader>
          <Field label="Extend by">
            <SimpleSelect value={extra} onChange={(v) => setExtra(v || "1")} options={["1", "2", "3"].map((n) => ({ value: n, label: `${n} more day${n === "1" ? "" : "s"} · +${money(listing.pricePerDay * Number(n))}` }))} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button
              onClick={() => {
                actions.extendRental(rental.id, Number(extra))
                toast.success(`Rental extended by ${extra} day${extra === "1" ? "" : "s"}`)
                close()
              }}
            >
              Extend rental
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "issue"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report an issue</DialogTitle>
            <DialogDescription>Describe what happened. This is sent to {lender.name} in your conversation.</DialogDescription>
          </DialogHeader>
          <Textarea value={issue} onChange={(e) => setIssue(e.target.value)} aria-label="Issue details" placeholder="What went wrong?" className="min-h-28" />
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button
              disabled={!issue.trim()}
              onClick={() => {
                const id = actions.openThread(listing.lenderId, listing.id, "Issue", "renting")
                actions.sendMessage(id, { text: `Issue with reservation #${rental.code}: ${issue.trim()}` })
                setIssue("")
                toast.success("Issue reported to the lender")
                close()
              }}
            >
              Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "cancel"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this request?</DialogTitle>
            <DialogDescription>The lender hasn’t accepted yet, so nothing has been charged.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Keep request</Button>
            <Button
              variant="destructive"
              onClick={() => {
                actions.cancelRental(rental.id)
                toast.success("Reservation request cancelled")
                router.push("/rentals")
              }}
            >
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Route() {
  const s = useApp()
  const { id } = useParams<{ id: string }>()
  const rental = s.rentals.find((r) => r.id === id)
  const listing = rental && listingById(s, rental.listingId)
  if (!rental || !listing) return <NotFound what="rental" href="/rentals" cta="My rentals" />
  return <RentalView rental={rental} listing={listing} />
}

export default function RentalPage() {
  return (
    <AppShell auth>
      <Route />
    </AppShell>
  )
}
