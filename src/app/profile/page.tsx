"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Calendar, Check, Leaf, MapPin, Shield, Shirt } from "lucide-react"
import { toast } from "sonner"

import { Gate, useApp } from "@/components/app-provider"
import { Chip, EmptyState, Photo, LinkButton, Panel, PersonAvatar, Rating, SegTabs } from "@/components/kit"
import { responseRate } from "@/components/lender-bits"
import { ListingCard } from "@/components/listing-card"
import { NotFound } from "@/components/rental-bits"
import { AppShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { actions, currentAccount, personFor } from "@/lib/store"

function VerifyRow({ label, verified, onVerify }: { label: string; verified: boolean; onVerify?: () => void }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 text-sm">
      {label}
      {verified ? (
        <Badge variant="success">
          <Check /> Verified
        </Badge>
      ) : onVerify ? (
        <Button size="sm" variant="outline" onClick={onVerify}>Verify</Button>
      ) : (
        <span className="text-[13px] text-muted-foreground">Not verified</span>
      )}
    </div>
  )
}

function Profile() {
  const s = useApp()
  const id = useSearchParams().get("id") ?? "me"
  const account = currentAccount(s)
  const own = id === "me"
  const [tab, setTab] = useState<"closet" | "reviews" | "about">("closet")
  const [showAll, setShowAll] = useState(false)

  // Viewing your own profile needs a session; Gate handles the redirect to log in.
  if (own && !account) return <Gate auth>{null}</Gate>
  if (!own && !s.people.some((p) => p.id === id)) return <NotFound what="member" />

  const person = personFor(s, id)
  const closet = s.listings.filter((l) => l.lenderId === id && (own ? l.status !== "draft" : l.status === "listed"))
  const closetIds = new Set(s.listings.filter((l) => l.lenderId === id).map((l) => l.id))
  const reviews = s.reviews.filter((r) => closetIds.has(r.listingId))
  const rated = closet.filter((l) => l.reviewCount > 0)
  const reviewCount = rated.reduce((n, l) => n + l.reviewCount, 0)
  const rating = reviewCount ? rated.reduce((n, l) => n + l.rating * l.reviewCount, 0) / reviewCount : person.rating
  const asLender = own ? closet.reduce((n, l) => n + l.rentals, 0) : person.rentals
  const asRenter = own ? s.rentals.filter((r) => ["active", "returned", "completed"].includes(r.status)).length : null
  const rate = own ? responseRate(s) : null
  const bio = own ? account!.bio : `${person.name.split(" ")[0]} lends from a closet in ${person.neighborhood}.`
  const sizes = own
    ? [
        ...account!.sizes.dress.map((x) => `Dress ${x}`),
        ...account!.sizes.tops.map((x) => `Tops ${x}`),
        ...(account!.sizes.suit ? [`Suit ${account!.sizes.suit}`] : []),
        ...(account!.sizes.waist ? [`Waist ${account!.sizes.waist}`] : []),
        ...(account!.sizes.shoe ? [`Shoe ${account!.sizes.shoe}`] : []),
      ]
    : []
  const stats = [
    { value: String(asLender), label: "Rentals as lender" },
    ...(asRenter !== null ? [{ value: String(asRenter), label: "Rentals as renter" }] : []),
    { value: rating ? rating.toFixed(1) : "–", label: "Average rating" },
    ...(own ? [{ value: rate === null ? "–" : `${rate}%`, label: "Response rate" }] : []),
    { value: person.replyTime.includes("hour") ? "< 1 hr" : "Same day", label: "Typical reply" },
  ]
  const verify = (patch: Parameters<typeof actions.updateAccount>[0], what: string) => {
    actions.updateAccount(patch)
    toast.success(`${what} marked as verified (simulated in this MVP)`)
  }

  const reviewCards = (list: typeof reviews) => (
    <div className="grid gap-4 md:grid-cols-2">
      {list.map((r) => (
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
  )

  return (
    <>
      <Panel className="gap-0 overflow-hidden p-0">
        <Photo src={`/art/cover-${([...person.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 3) + 1}.jpg`} alt="" className="h-40 rounded-none" />
        <div className="flex flex-wrap items-start gap-6 p-6">
          <PersonAvatar initials={person.initials} src={own ? account!.avatar : undefined} className="size-24 text-2xl" />
          <div className="flex min-w-[240px] flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-[-0.48px]">{person.name}</h1>
              {person.verified && (
                <Badge variant="outline">
                  <Shield /> ID verified
                </Badge>
              )}
              <Badge variant="secondary">{own ? "Lender & renter" : "Lender"}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {person.neighborhood}</span>
              <span className="flex items-center gap-1.5"><Calendar className="size-3.5" /> Member since {person.memberSince}</span>
            </div>
            <p className="max-w-2xl text-sm leading-normal text-muted-foreground">
              {bio || "No bio yet. Add a sentence or two about your style and what’s in your closet."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                const url = `${window.location.origin}/profile${own ? "" : `?id=${id}`}`
                try {
                  await navigator.clipboard.writeText(url)
                  toast.success("Profile link copied")
                } catch {
                  toast.info(url)
                }
              }}
            >
              Share
            </Button>
            {own && <LinkButton href="/settings">Edit profile</LinkButton>}
          </div>
        </div>
        <Separator />
        <dl className="grid grid-cols-2 gap-y-4 p-5 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
          {stats.map((st) => (
            <div key={st.label} className="flex flex-col items-center gap-1 text-center">
              <dd className="text-xl font-semibold">{st.value}</dd>
              <dt className="text-[13px] text-muted-foreground">{st.label}</dt>
            </div>
          ))}
        </dl>
      </Panel>

      <SegTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "closet", label: `Closet (${closet.length})` },
          { value: "reviews", label: `Reviews (${reviews.length})` },
          { value: "about", label: "About" },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {tab === "closet" && (
            <>
              {closet.length === 0 ? (
                <EmptyState icon={Shirt} title="No outfits listed yet" description={own ? "List an outfit to start lending." : undefined}>
                  {own && <LinkButton href="/lender/closet/new">List an item</LinkButton>}
                </EmptyState>
              ) : (
                <div className="grid grid-cols-2 gap-x-5 gap-y-8 xl:grid-cols-3">
                  {closet.map((l) => (
                    <ListingCard key={l.id} listing={l} />
                  ))}
                </div>
              )}
              {reviews.length > 0 && (
                <>
                  <div className="flex items-center justify-between pt-2">
                    <h2 className="text-xl font-semibold">Reviews</h2>
                    <Rating value={rating} count={reviewCount} />
                  </div>
                  {reviewCards(showAll ? reviews : reviews.slice(0, 2))}
                  {reviews.length > 2 && (
                    <Button variant="outline" className="w-fit" onClick={() => setShowAll(!showAll)}>
                      {showAll ? "Show fewer reviews" : "Show all reviews"}
                    </Button>
                  )}
                </>
              )}
            </>
          )}
          {tab === "reviews" &&
            (reviews.length ? reviewCards(reviews) : <p className="text-sm text-muted-foreground">No reviews yet. They appear after a completed rental.</p>)}
          {tab === "about" && (
            <Panel>
              <h2 className="text-base font-semibold">About {person.name.split(" ")[0]}</h2>
              <p className="text-sm leading-normal text-muted-foreground">{bio || "No bio yet."}</p>
              <p className="text-sm text-muted-foreground">
                Based in {person.neighborhood} · Member since {person.memberSince} · {person.replyTime || "Replies when they can"}
              </p>
            </Panel>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          {own && (
            <Panel className="gap-4">
              <h2 className="text-base font-semibold">Sizes &amp; style</h2>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium text-muted-foreground">Sizes</p>
                <div className="flex flex-wrap gap-2">
                  {sizes.length ? sizes.map((x) => <Chip key={x}>{x}</Chip>) : <LinkButton href="/settings#sizes" variant="outline" size="sm">Add your sizes</LinkButton>}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium text-muted-foreground">Style</p>
                <div className="flex flex-wrap gap-2">
                  {account!.styles.length ? account!.styles.map((x) => <Chip key={x}>{x}</Chip>) : <span className="text-[13px] text-muted-foreground">No styles picked yet.</span>}
                </div>
              </div>
            </Panel>
          )}
          <Panel className="gap-3">
            <h2 className="text-base font-semibold">Verification</h2>
            {own ? (
              <>
                <VerifyRow label="Government ID" verified={account!.idVerified} onVerify={() => verify({ idVerified: true }, "ID")} />
                <VerifyRow label="Email" verified={Boolean(account!.emailVerified)} onVerify={() => verify({ emailVerified: true }, "Email")} />
                <VerifyRow
                  label="Phone"
                  verified={Boolean(account!.phoneVerified)}
                  onVerify={() => (account!.phone.trim() ? verify({ phoneVerified: true }, "Phone") : toast.error("Add a phone number in Settings first."))}
                />
                <div className="flex min-h-7 items-center justify-between gap-3 text-sm">
                  Payout account
                  {account!.payoutVerified ? (
                    <Badge variant="success"><Check /> Verified</Badge>
                  ) : (
                    <LinkButton href="/lender/earnings" variant="outline" size="sm">Verify</LinkButton>
                  )}
                </div>
              </>
            ) : (
              <VerifyRow label="Government ID" verified={person.verified} />
            )}
          </Panel>
          <Panel className="items-start gap-3">
            <Badge variant="success">
              <Leaf /> Impact
            </Badge>
            <p className="text-lg font-semibold">{asLender + (asRenter ?? 0)} outfits shared</p>
            <p className="text-[13px] leading-normal text-muted-foreground">
              Sharing helps most when a rental replaces buying new. The real benefit also depends on transport and cleaning.
            </p>
          </Panel>
        </aside>
      </div>
    </>
  )
}

export default function ProfilePage() {
  return (
    <AppShell>
      <Suspense>
        <Profile />
      </Suspense>
    </AppShell>
  )
}
