"use client"

import { Suspense, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "cn"
import { DollarSign, MapPin, Upload, X } from "lucide-react"
import { toast } from "sonner"

import { useAccount, useApp } from "@/components/app-provider"
import { BackLink, CheckItem, ChipGroup, Field, FieldGroup, PageTitle, Panel, PanelHeader, PhotoSlot, RadioCard, Row, SimpleSelect } from "@/components/kit"
import { ListingCard } from "@/components/listing-card"
import { NotFound } from "@/components/rental-bits"
import { LenderShell } from "@/components/site/shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { CATEGORIES, COLORS, fileToDataUrl, lenderEarn, money, OCCASIONS, PLATFORM_FEE_RATE, SIZES, todayISO, uid, WEEKDAYS } from "@/lib/format"
import { actions, listingById } from "@/lib/store"
import type { Listing, PhotoKey } from "@/lib/types"

const SIZE_OPTIONS = [...SIZES, "36R", "38S", "38R", "40R", "40L", "42R", "42L", "44R", "46R"]
const STYLE_OPTIONS = ["Classic", "Minimal", "Bold", "Vintage", "Cultural / traditional"]
const HANDOFF_OPTIONS = ["Meet at a public spot", "Pickup at my home", "I can drop off nearby"]
const CONDITION_SLOTS: { key: PhotoKey; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "label", label: "Label" },
  { key: "wear", label: "Detail / wear" },
]
const MAX_PHOTOS = 8

/** Maps numeric suit sizes onto the letter sizes the browse filters use. */
function sizeGroupFor(size: string) {
  if (SIZES.includes(size)) return size
  const chest = parseInt(size, 10)
  if (Number.isNaN(chest)) return ""
  return chest <= 38 ? "S" : chest <= 40 ? "M" : chest <= 42 ? "L" : chest <= 44 ? "XL" : "XXL"
}

function blank(pickupArea: string): Listing {
  return {
    id: uid("m-"),
    title: "",
    category: "",
    brand: "",
    color: "",
    size: "",
    sizeGroup: "",
    sizeNote: "",
    fit: "",
    description: "",
    occasions: [],
    styles: [],
    pricePerDay: 0,
    minDays: 1,
    deposit: 0,
    cleaningFee: 0,
    cleaningIncluded: true,
    tryOn: true,
    lenderId: "me",
    distance: null,
    rating: 0,
    reviewCount: 0,
    rentals: 0,
    photos: [],
    condition: {},
    status: "draft",
    booked: [],
    pickupArea,
    handoff: ["Meet at a public spot"],
    days: [],
    careNotes: "",
    createdAt: todayISO(),
  }
}

function MoneyInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Field label={label}>
      <span className="relative">
        <DollarSign className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0.00" className="pl-9" />
      </span>
    </Field>
  )
}

function ListingForm({ existing }: { existing?: Listing }) {
  const account = useAccount()
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [l, setL] = useState<Listing>(() => existing ?? blank(account.zip))
  const [price, setPrice] = useState(existing?.pricePerDay ? String(existing.pricePerDay) : "")
  const [deposit, setDeposit] = useState(existing?.deposit ? String(existing.deposit) : "")
  const [cleaning, setCleaning] = useState(existing?.cleaningFee ? String(existing.cleaningFee) : "")
  const [policy, setPolicy] = useState<"lender" | "renter" | null>(existing ? (existing.cleaningIncluded ? "lender" : "renter") : null)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const patch = (p: Partial<Listing>) => setL((cur) => ({ ...cur, ...p }))

  const pricePerDay = Number(price) || 0
  const photoCount = l.photos.length + CONDITION_SLOTS.filter((c) => l.condition[c.key]).length
  const checks = [
    { label: "Photos added", done: photoCount >= 4 },
    { label: "Details complete", done: Boolean(l.title.trim() && l.category && l.size && l.description.trim()) },
    { label: "Price set", done: pricePerDay > 0 },
    { label: "Handoff preferences", done: Boolean(l.pickupArea.trim() && l.handoff.length && l.days.length) },
    { label: "Policy confirmed", done: policy !== null },
  ]
  const doneCount = checks.filter((c) => c.done).length
  const sample = lenderEarn(pricePerDay * 3)

  const build = (status: Listing["status"]): Listing => ({
    ...l,
    title: l.title.trim(),
    sizeGroup: sizeGroupFor(l.size),
    pricePerDay,
    deposit: Number(deposit) || 0,
    cleaningFee: policy === "renter" ? 0 : Number(cleaning) || 0,
    cleaningIncluded: policy !== "renter",
    status,
  })

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    const room = MAX_PHOTOS - l.photos.length
    if (room <= 0) return void toast.error(`You can add up to ${MAX_PHOTOS} photos.`)
    const images = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room)
    if (!images.length) return void toast.error("Only image files can be added.")
    try {
      const urls = await Promise.all(images.map((f) => fileToDataUrl(f)))
      setL((cur) => ({ ...cur, photos: [...cur.photos, ...urls] }))
    } catch {
      toast.error("One of those files couldn't be read as an image.")
    }
  }

  const save = async (status: Listing["status"], done: string) => {
    setSaving(true)
    const result = await actions.saveListing(build(status), !existing)
    setSaving(false)
    if (!result.ok) return void toast.error(result.error)
    toast.success(done)
    router.push("/lender/closet")
  }
  const saveDraft = () => {
    if (!l.title.trim()) return void toast.error("Give the item a title before saving a draft.")
    void save(existing && existing.status !== "draft" ? existing.status : "draft", existing ? "Changes saved" : "Draft saved")
  }
  const publish = () => {
    const missing = checks.filter((c) => !c.done && c.label !== "Photos added").map((c) => c.label.toLowerCase())
    if (missing.length) return void toast.error(`Still needed before publishing: ${missing.join(", ")}.`)
    void save("listed", `${l.title.trim()} is now listed`)
  }

  return (
    <>
      <BackLink href="/lender/closet">My closet</BackLink>
      <PageTitle title={existing ? "Edit listing" : "List an item"} description="Add photos, details, and your handoff preferences.">
        <div className="flex gap-2">
          <Button variant="outline" disabled={saving} onClick={saveDraft}>Save draft</Button>
          <Button disabled={saving} onClick={publish}>{saving ? "Saving…" : existing?.status === "listed" ? "Save changes" : "Publish listing"}</Button>
        </div>
      </PageTitle>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Photos" description="Add at least 4. Condition photos build trust." />
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                void addPhotos(e.dataTransfer.files)
              }}
              className={cn(
                "flex h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ring bg-subtle text-center transition-colors",
                dragging && "border-primary bg-muted"
              )}
            >
              <Upload className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">
                Drag photos here or{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => fileInput.current?.click()}>
                  browse
                </button>
              </p>
              <p className="text-xs text-muted-foreground">PNG or JPG, up to 10 MB each · {l.photos.length}/{MAX_PHOTOS} added</p>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addPhotos(e.target.files)
                  e.target.value = ""
                }}
              />
            </div>
            {l.photos.length > 0 && (
              <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                {l.photos.map((src, i) => (
                  <li key={i} className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- user uploads are data URLs */}
                    <img src={src} alt={`Outfit photo ${i + 1}`} className="size-full object-cover" />
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => patch({ photos: l.photos.filter((_, j) => j !== i) })}
                      className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/90 hover:bg-background"
                    >
                      <X className="size-3" />
                    </button>
                    {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-[10px] font-medium">Cover</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {CONDITION_SLOTS.map((c) => (
                <PhotoSlot key={c.key} label={c.label} value={l.condition[c.key]} onChange={(v) => patch({ condition: { ...l.condition, [c.key]: v } })} className="h-[110px]" />
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Details" />
            <Field label="Title">
              <Input value={l.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Emerald satin gown" maxLength={60} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Category">
                <SimpleSelect value={l.category} onChange={(category) => patch({ category })} options={CATEGORIES} />
              </Field>
              <Field label="Brand">
                <Input value={l.brand} onChange={(e) => patch({ brand: e.target.value })} placeholder="Brand name" />
              </Field>
              <Field label="Color">
                <SimpleSelect value={l.color} onChange={(color) => patch({ color })} options={COLORS} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Size">
                <SimpleSelect value={l.size} onChange={(size) => patch({ size })} options={SIZE_OPTIONS} />
              </Field>
              <Field label="Fit notes">
                <Input value={l.fit} onChange={(e) => patch({ fit: e.target.value })} placeholder="e.g. Runs small" />
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={l.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Fabric, fit, how it was worn, and anything a renter should know before a try-on." className="min-h-24" />
            </Field>
            <FieldGroup label="Occasions">
              <ChipGroup options={OCCASIONS.slice(0, 5)} value={l.occasions} onChange={(occasions) => patch({ occasions })} />
            </FieldGroup>
            <FieldGroup label="Style">
              <ChipGroup options={STYLE_OPTIONS} value={l.styles} onChange={(styles) => patch({ styles })} />
            </FieldGroup>
          </Panel>

          <Panel>
            <PanelHeader title="Pricing" description={`You set the price. The platform takes ${Math.round(PLATFORM_FEE_RATE * 100)}% of completed rentals.`} />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <MoneyInput label="Price per day" value={price} onChange={setPrice} />
              <Field label="Minimum days">
                <SimpleSelect value={String(l.minDays)} onChange={(v) => patch({ minDays: Number(v) || 1 })} options={["1", "2", "3", "4", "5", "7"]} />
              </Field>
              <MoneyInput label="Refundable deposit" value={deposit} onChange={setDeposit} />
              <MoneyInput label="Cleaning fee" value={policy === "renter" ? "" : cleaning} onChange={setCleaning} />
            </div>
            <div className="flex flex-col gap-3 rounded-[10px] border bg-subtle p-4">
              <Row label="Renter pays (3 days)" value={money(pricePerDay * 3)} />
              <Row label={`Platform fee (${Math.round(PLATFORM_FEE_RATE * 100)}%)`} value={`– ${money(sample.fee)}`} />
              <Separator />
              <Row strong label="You earn" value={money(sample.earn)} />
            </div>
            <p className="text-xs text-muted-foreground">The cleaning fee and deposit are passed through separately and aren’t part of the platform fee.</p>
          </Panel>

          <Panel>
            <PanelHeader title="Try-ons & handoff" />
            <label className="flex items-center gap-4">
              <span className="flex flex-1 flex-col gap-1">
                <span className="text-sm font-medium">Offer in-person try-ons</span>
                <span className="text-[13px] text-muted-foreground">Renters can try before they reserve.</span>
              </span>
              <Switch checked={l.tryOn} onCheckedChange={(tryOn) => patch({ tryOn })} />
            </label>
            <Separator />
            <Field label="Pickup area" hint="Exact address is only shared after you accept.">
              <span className="relative">
                <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={l.pickupArea} onChange={(e) => patch({ pickupArea: e.target.value })} placeholder="Neighborhood or ZIP" className="pl-9" />
              </span>
            </Field>
            <FieldGroup label="Handoff options">
              <div className="flex flex-col gap-2.5">
                {HANDOFF_OPTIONS.map((o) => (
                  <CheckItem key={o} checked={l.handoff.includes(o)} onChange={(on) => patch({ handoff: on ? [...l.handoff, o] : l.handoff.filter((x) => x !== o) })}>
                    {o}
                  </CheckItem>
                ))}
              </div>
            </FieldGroup>
            <FieldGroup label="Usually available">
              <ChipGroup options={WEEKDAYS} value={l.days} onChange={(days) => patch({ days: WEEKDAYS.filter((d) => days.includes(d)) })} />
            </FieldGroup>
          </Panel>

          <Panel>
            <PanelHeader title="Cleaning & damage policy" />
            <div role="radiogroup" aria-label="Who cleans" className="flex flex-col gap-3">
              <RadioCard selected={policy === "lender"} onSelect={() => setPolicy("lender")} title="I’ll clean it after each rental" description="Cleaning fee is added to the renter’s total." />
              <RadioCard selected={policy === "renter"} onSelect={() => setPolicy("renter")} title="Renter cleans before return" description="Add care instructions below." />
            </div>
            <Field label="Care & damage notes">
              <Textarea value={l.careNotes} onChange={(e) => patch({ careNotes: e.target.value })} placeholder="e.g. Dry clean only. Tell me about any marks at return." className="min-h-24" />
            </Field>
          </Panel>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-24">
          <Panel className="gap-4">
            <h2 className="text-base font-semibold">Listing preview</h2>
            <ListingCard preview listing={{ ...build(l.status), rating: l.rating }} />
          </Panel>
          <Panel className="gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Checklist</h2>
              <span className="text-[13px] text-muted-foreground">{doneCount} of {checks.length}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Listing completeness" aria-valuemin={0} aria-valuemax={checks.length} aria-valuenow={doneCount}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / checks.length) * 100}%` }} />
            </div>
            {checks.map((c) => (
              <CheckItem key={c.label} checked={c.done} disabled>
                <span className={cn(!c.done && "text-muted-foreground")}>{c.label}</span>
              </CheckItem>
            ))}
          </Panel>
        </aside>
      </div>
    </>
  )
}

function Route() {
  const s = useApp()
  const editId = useSearchParams().get("edit")
  if (!editId) return <ListingForm />
  const existing = listingById(s, editId)
  if (!existing || existing.lenderId !== "me") return <NotFound what="listing" href="/lender/closet" cta="My closet" />
  return <ListingForm key={existing.id} existing={existing} />
}

export default function ListItemPage() {
  return (
    <LenderShell>
      <Suspense>
        <Route />
      </Suspense>
    </LenderShell>
  )
}
