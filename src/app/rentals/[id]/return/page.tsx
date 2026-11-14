"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { cn } from "cn"
import { Check, Clock, Leaf, Star } from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { BackLink, CheckItem, ChipGroup, Field, FieldGroup, Photo, LinkButton, PageTitle, Panel, PanelHeader, PhotoSlot, RENTAL_STEPS, Stepper } from "@/components/kit"
import { NotFound, PHOTO_SLOTS, PhotoRecord, RentalSummaryCard, rentalStep } from "@/components/rental-bits"
import { AppShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { money, todayISO } from "@/lib/format"
import { actions, listingById } from "@/lib/store"
import type { Listing, Rental } from "@/lib/types"

const RETURN_CHECKS = ["Outfit handed back to the lender", "Cleaning handled as agreed", "No new damage to report"]
const TAGS = ["True to size", "Great condition", "Easy handoff", "As pictured", "Friendly lender"]

function Stars({ label, value, onChange, disabled }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <FieldGroup label={label}>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" disabled={disabled} aria-label={`${n} star${n === 1 ? "" : "s"}`} aria-pressed={value === n} onClick={() => onChange(n)} className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50">
            <Star className={cn("size-7", n <= value ? "fill-amber-400 text-amber-400" : "text-border")} />
          </button>
        ))}
      </div>
    </FieldGroup>
  )
}

function ReturnView({ rental, listing }: { rental: Rental; listing: Listing }) {
  const router = useRouter()
  const [outfit, setOutfit] = useState(0)
  const [lender, setLender] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [text, setText] = useState("")

  const canReturn = rental.status === "active"
  const returned = rental.status === "returned" || rental.status === "completed"
  const canReview = rental.status === "returned" && !rental.reviewed
  const checks = rental.returnChecklist
  const setCheck = (i: number, v: boolean) =>
    actions.updateRental(rental.id, { returnChecklist: checks.map((x, j) => (j === i ? v : x)) })

  return (
    <>
      <BackLink href="/rentals">My rentals</BackLink>
      <PageTitle title="Return and review" description={`Reservation #${rental.code} · ${listing.title}`}>
        {canReturn ? (
          <Badge variant="warning">
            <Clock /> {rental.end === todayISO() ? "Return due today" : rental.end < todayISO() ? "Return overdue" : "Return upcoming"}
          </Badge>
        ) : (
          returned && <Badge variant="success"><Check /> Returned</Badge>
        )}
      </PageTitle>
      <Panel className="py-4">
        <Stepper steps={RENTAL_STEPS} current={rentalStep(rental)} />
      </Panel>
      {!canReturn && !returned && (
        <Panel className="flex-row flex-wrap items-center gap-4">
          <p className="flex-1 text-sm text-muted-foreground">The return opens once you’ve picked up the outfit.</p>
          <LinkButton href={`/rentals/${rental.id}`} variant="outline">View rental</LinkButton>
        </Panel>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Return condition photos" description="Retake the same photos so both sides can compare." />
            <p className="text-sm font-semibold">At pickup</p>
            <PhotoRecord photos={rental.pickupPhotos} fallback={listing.condition} empty="No photos were added at pickup." />
            <p className="text-sm font-semibold">At return</p>
            {canReturn ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {PHOTO_SLOTS.map((p) => (
                  <PhotoSlot key={p.key} label={p.label} value={rental.returnPhotos[p.key]} onChange={(v) => actions.setRentalPhoto(rental.id, "return", p.key, v)} />
                ))}
              </div>
            ) : (
              <PhotoRecord
                photos={rental.returnPhotos}
                fallback={returned ? listing.condition : undefined}
                empty={returned ? "No photos were added at return." : "You can add return photos once the rental has started."}
              />
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Confirm return" />
            {RETURN_CHECKS.map((label, i) => (
              <CheckItem key={label} checked={returned || checks[i]!} disabled={!canReturn} onChange={(v) => setCheck(i, v)}>
                {label}
              </CheckItem>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">
                {returned ? `Your ${money(rental.deposit)} deposit hold has been released.` : `Your ${money(rental.deposit)} deposit is released once the lender confirms.`}
              </p>
              {canReturn && (
                <Button
                  disabled={!checks[0] || !checks[1]}
                  onClick={() => {
                    actions.confirmReturn(rental.id)
                    toast.success(checks[2] ? "Return confirmed. Your deposit has been released." : "Return confirmed. The lender will review the condition photos.")
                  }}
                >
                  <Check /> Confirm return
                </Button>
              )}
            </div>
            {canReturn && !checks[2] && (checks[0] || checks[1]) && (
              <p className="text-xs text-muted-foreground">If there’s new damage, leave the last box unticked and message the lender — the photos above are your record.</p>
            )}
          </Panel>

          <Panel className={cn(!canReview && "opacity-80")}>
            <PanelHeader
              title="Leave a review"
              description={rental.reviewed ? "Thanks — your review has been submitted." : canReview ? "Reviews appear after both sides submit." : "Available once you’ve confirmed the return."}
            />
            {!rental.reviewed && (
              <>
                <div className="flex flex-wrap gap-10">
                  <Stars label="Outfit" value={outfit} onChange={setOutfit} disabled={!canReview} />
                  <Stars label="Lender" value={lender} onChange={setLender} disabled={!canReview} />
                </div>
                <FieldGroup label="What stood out?">
                  <ChipGroup options={TAGS} value={tags} onChange={canReview ? setTags : () => {}} />
                </FieldGroup>
                <Field label="Your review">
                  <Textarea value={text} disabled={!canReview} onChange={(e) => setText(e.target.value)} placeholder="How was the fit, condition, and handoff?" className="min-h-28" />
                </Field>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="ghost"
                    disabled={!canReview}
                    onClick={() => {
                      actions.skipReview(rental.id)
                      router.push("/rentals?tab=past")
                    }}
                  >
                    Skip
                  </Button>
                  <Button
                    disabled={!canReview || !outfit || !lender}
                    onClick={() => {
                      actions.submitReview(rental.id, { outfit, lender, tags, text })
                      toast.success("Review submitted. Thank you!")
                      router.push("/rentals?tab=past")
                    }}
                  >
                    Submit review
                  </Button>
                </div>
              </>
            )}
          </Panel>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <RentalSummaryCard rental={rental} listing={listing} />
          <Panel className="items-start gap-3">
            <Badge variant="success">
              <Leaf /> Sustainability
            </Badge>
            <p className="text-lg font-semibold">One less outfit bought new</p>
            <p className="text-[13px] leading-normal text-muted-foreground">
              That’s the best case. The real benefit depends on whether this rental replaced a purchase, plus how you travelled to the handoff and how it was cleaned.
            </p>
            <Photo src="/art/cover-3.jpg" alt="A rail of outfits" className="h-24 w-full" />
          </Panel>
        </aside>
      </div>
    </>
  )
}

function Route() {
  const s = useApp()
  const { id } = useParams<{ id: string }>()
  const rental = s.rentals.find((r) => r.id === id)
  const listing = rental && listingById(s, rental.listingId)
  if (!rental || !listing) return <NotFound what="rental" href="/rentals" cta="My rentals" />
  return <ReturnView rental={rental} listing={listing} />
}

export default function ReturnPage() {
  return (
    <AppShell auth>
      <Route />
    </AppShell>
  )
}
