"use client"

import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, MapPin, Search, SlidersHorizontal, X } from "lucide-react"

import { Gate, useApp } from "@/components/app-provider"
import { CheckItem, ChipGroup, DateRangeField, EmptyState, SegTabs, SimpleSelect } from "@/components/kit"
import { MapArt } from "@/components/map-art"
import { ListingCard } from "@/components/listing-card"
import { Footer } from "@/components/site/footer"
import { Navbar } from "@/components/site/navbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { money, OCCASIONS, overlaps, SIZES, whereLabel } from "@/lib/format"
import type { Listing } from "@/lib/types"

const STYLE_FILTERS = ["Classic", "Minimal", "Bold", "Vintage", "Cultural / traditional"]
const OCCASION_FILTERS = ["Wedding", "Interview", "Party", "Formal event"]
const SORTS = [
  { value: "nearest", label: "Sort: Nearest first" },
  { value: "price-asc", label: "Sort: Price, low to high" },
  { value: "price-desc", label: "Sort: Price, high to low" },
  { value: "rating", label: "Sort: Top rated" },
]
const PAGE_SIZE = 9
const MAX_BUDGET = 200
const MAX_DISTANCE = 25

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const single = (v: number | readonly number[]) => (typeof v === "number" ? v : v[0]!)

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  )
}

function MapView({ listings }: { listings: Listing[] }) {
  return (
    <MapArt seed="browse" wide marker={false} className="h-[560px]">
      <p className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full border bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-card">
        <MapPin className="size-3.5" /> Pins show approximate pickup areas
      </p>
      {listings.slice(0, 24).map((l, i) => {
        // Deterministic pseudo-positions: nearer outfits sit closer to the centre.
        const angle = (i * 137.5 * Math.PI) / 180
        const r = Math.min(44, 8 + ((l.distance ?? MAX_DISTANCE / 2) / MAX_DISTANCE) * 90)
        return (
          <Link
            key={l.id}
            href={`/listing/${l.id}`}
            title={`${l.title} · ${whereLabel(l)}`}
            style={{ left: `${50 + Math.cos(angle) * r}%`, top: `${50 + Math.sin(angle) * r * 0.8}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border bg-background px-2.5 py-1 text-xs font-semibold shadow-card hover:bg-primary hover:text-primary-foreground"
          >
            {money(l.pricePerDay)}
          </Link>
        )
      })}
      <span className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20" />
    </MapArt>
  )
}

function Browse() {
  const s = useApp()
  const params = useSearchParams()
  const [near, setNear] = useState(params.get("near") ?? "")
  const [query, setQuery] = useState(params.get("q") ?? "")
  const [start, setStart] = useState(params.get("start") ?? undefined)
  const [end, setEnd] = useState(params.get("end") ?? undefined)
  const [sizes, setSizes] = useState<string[]>(params.get("size") ? [params.get("size")!] : [])
  const [styles, setStyles] = useState<string[]>([])
  const [occasions, setOccasions] = useState<string[]>(params.get("occasion") ? [params.get("occasion")!] : [])
  const [budget, setBudget] = useState(MAX_BUDGET)
  const [distance, setDistance] = useState(MAX_DISTANCE)
  const [tryOn, setTryOn] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [saved, setSaved] = useState(params.get("saved") === "1")
  const [sort, setSort] = useState("nearest")
  const [view, setView] = useState<"grid" | "map">("grid")
  const [page, setPage] = useState(1)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = s.listings.filter((l) => {
      if (l.status !== "listed") return false
      if (saved && !s.favorites.includes(l.id)) return false
      if (q) {
        const haystack = [l.title, l.category, l.brand, l.color, ...l.styles, ...l.occasions].join(" ").toLowerCase()
        if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false
      }
      if (sizes.length && !sizes.includes(l.sizeGroup)) return false
      if (styles.length && !styles.some((x) => l.styles.includes(x))) return false
      if (occasions.length && !occasions.some((x) => l.occasions.includes(x))) return false
      if (budget < MAX_BUDGET && l.pricePerDay > budget) return false
      // Listings without a known distance stay visible rather than being silently dropped.
      if (distance < MAX_DISTANCE && l.distance !== null && l.distance > distance) return false
      if (tryOn && !l.tryOn) return false
      if (cleaning && !l.cleaningIncluded) return false
      if (start && l.booked.some((b) => overlaps(start, end ?? start, b.start, b.end))) return false
      return true
    })
    const by: Record<string, (a: Listing, b: Listing) => number> = {
      nearest: (a, b) => (a.distance ?? 1e6) - (b.distance ?? 1e6),
      "price-asc": (a, b) => a.pricePerDay - b.pricePerDay,
      "price-desc": (a, b) => b.pricePerDay - a.pricePerDay,
      rating: (a, b) => b.rating - a.rating,
    }
    // Your own listings stay findable, but never crowd out what you can actually rent.
    const own = (l: Listing) => (l.lenderId === "me" ? 1 : 0)
    return list.sort((a, b) => own(a) - own(b) || by[sort]!(a, b))
  }, [s.listings, s.favorites, query, sizes, styles, occasions, budget, distance, tryOn, cleaning, saved, start, end, sort])

  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  // Any filter change returns to the first page.
  const change = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }

  const active: { label: string; clear: () => void }[] = [
    ...(saved ? [{ label: "Saved", clear: () => setSaved(false) }] : []),
    ...(query.trim() ? [{ label: `“${query.trim()}”`, clear: () => setQuery("") }] : []),
    ...sizes.map((x) => ({ label: `Size ${x}`, clear: () => setSizes(sizes.filter((v) => v !== x)) })),
    ...occasions.map((x) => ({ label: x, clear: () => setOccasions(occasions.filter((v) => v !== x)) })),
    ...styles.map((x) => ({ label: x, clear: () => setStyles(styles.filter((v) => v !== x)) })),
    ...(budget < MAX_BUDGET ? [{ label: `Up to $${budget} / day`, clear: () => setBudget(MAX_BUDGET) }] : []),
    ...(distance < MAX_DISTANCE ? [{ label: `Within ${distance} mi`, clear: () => setDistance(MAX_DISTANCE) }] : []),
    ...(tryOn ? [{ label: "Try-on available", clear: () => setTryOn(false) }] : []),
    ...(cleaning ? [{ label: "Cleaning included", clear: () => setCleaning(false) }] : []),
  ]
  const clearAll = () => {
    setQuery("")
    setSizes([])
    setStyles([])
    setOccasions([])
    setBudget(MAX_BUDGET)
    setDistance(MAX_DISTANCE)
    setTryOn(false)
    setCleaning(false)
    setSaved(false)
    setStart(undefined)
    setEnd(undefined)
    setPage(1)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-4 md:px-8">
        <span className="relative w-full sm:w-[220px]">
          <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={near} onChange={(e) => setNear(e.target.value)} placeholder="City or ZIP" aria-label="Location" className="pl-9" />
        </span>
        <DateRangeField
          start={start}
          end={end}
          placeholder="Add rental dates"
          className="w-full sm:w-[220px]"
          onChange={(a, b) => {
            setStart(a)
            setEnd(b)
            setPage(1)
          }}
        />
        <SimpleSelect
          value={sizes[0] ?? ""}
          onChange={change((v: string) => setSizes(v && v !== "any" ? [v] : []))}
          options={[{ value: "any", label: "Any size" }, ...SIZES.map((x) => ({ value: x, label: `Size: ${x}` }))]}
          placeholder="Size"
          ariaLabel="Size"
          className="w-[160px]"
        />
        <SimpleSelect
          value={occasions[0] ?? ""}
          onChange={change((v: string) => setOccasions(v && v !== "any" ? [v] : []))}
          options={[{ value: "any", label: "Any occasion" }, ...OCCASIONS]}
          placeholder="Occasion"
          ariaLabel="Occasion"
          className="w-[180px]"
        />
        <div className="flex-1" />
        <SegTabs value={view} onChange={setView} items={[{ value: "grid", label: "Grid" }, { value: "map", label: "Map" }]} />
      </div>

      <div className="flex flex-col gap-8 px-4 py-8 md:px-8 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[264px]">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-base font-semibold">
              <SlidersHorizontal className="size-4" /> Filters
            </p>
            <button type="button" onClick={clearAll} className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
              Clear all
            </button>
          </div>
          <Separator />
          <FilterSection title="Size">
            <ChipGroup options={SIZES.slice(0, 5)} value={sizes} onChange={change(setSizes)} />
          </FilterSection>
          <Separator />
          <FilterSection title="Style">
            {STYLE_FILTERS.map((x) => (
              <CheckItem key={x} checked={styles.includes(x)} onChange={() => change(setStyles)(toggle(styles, x))}>
                {x}
              </CheckItem>
            ))}
          </FilterSection>
          <Separator />
          <FilterSection title="Occasion">
            {OCCASION_FILTERS.map((x) => (
              <CheckItem key={x} checked={occasions.includes(x)} onChange={() => change(setOccasions)(toggle(occasions, x))}>
                {x}
              </CheckItem>
            ))}
          </FilterSection>
          <Separator />
          <FilterSection title="Budget per day">
            <Slider min={10} max={MAX_BUDGET} step={5} value={[budget]} onValueChange={(v) => change(setBudget)(single(v))} aria-label="Budget per day" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>$10</span>
              <span className="font-medium text-foreground">{budget >= MAX_BUDGET ? "Any price" : `Up to $${budget}`}</span>
              <span>$200+</span>
            </div>
          </FilterSection>
          <Separator />
          <FilterSection title="Distance">
            <Slider min={1} max={MAX_DISTANCE} step={1} value={[distance]} onValueChange={(v) => change(setDistance)(single(v))} aria-label="Distance" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 mi</span>
              <span className="font-medium text-foreground">{distance >= MAX_DISTANCE ? "Any distance" : `Within ${distance} mi`}</span>
              <span>25 mi</span>
            </div>
          </FilterSection>
          <Separator />
          <label className="flex items-center justify-between gap-4">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Try-on available</span>
              <span className="text-xs text-muted-foreground">In-person before booking</span>
            </span>
            <Switch checked={tryOn} onCheckedChange={change(setTryOn)} />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Cleaning included</span>
              <span className="text-xs text-muted-foreground">Lender handles cleaning</span>
            </span>
            <Switch checked={cleaning} onCheckedChange={change(setCleaning)} />
          </label>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-[-0.48px]">
                {saved ? "Saved outfits" : `Outfits near ${near.trim() || "you"}`}
              </h1>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {results.length} {results.length === 1 ? "result" : "results"} · {SORTS.find((x) => x.value === sort)!.label.replace("Sort: ", "sorted by ").toLowerCase()}
              </p>
            </div>
            <SimpleSelect value={sort} onChange={(v) => setSort(v || "nearest")} options={SORTS} ariaLabel="Sort results" className="w-[220px]" />
          </div>
          {active.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {active.map((f) => (
                <Badge key={f.label} variant="outline" render={<button type="button" onClick={() => { f.clear(); setPage(1) }} aria-label={`Remove filter ${f.label}`} />}>
                  <X /> {f.label}
                </Badge>
              ))}
            </div>
          )}
          {results.length === 0 ? (
            <EmptyState icon={Search} title="No outfits match those filters" description="Try widening the distance or budget, or clear a filter or two.">
              <Button variant="outline" onClick={clearAll}>
                Clear all filters
              </Button>
            </EmptyState>
          ) : view === "map" ? (
            <MapView listings={results} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-8 xl:grid-cols-3">
                {visible.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
              {pages > 1 && (
                <nav aria-label="Pagination" className="flex items-center justify-center gap-1 pt-2">
                  <Button variant="ghost" disabled={current === 1} onClick={() => setPage(current - 1)}>
                    <ChevronLeft /> Previous
                  </Button>
                  {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                    <Button key={n} variant={n === current ? "outline" : "ghost"} size="icon" aria-current={n === current ? "page" : undefined} onClick={() => setPage(n)}>
                      {n}
                    </Button>
                  ))}
                  <Button variant="ghost" disabled={current === pages} onClick={() => setPage(current + 1)}>
                    Next <ChevronRight />
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}

function BrowseWithParams() {
  const params = useSearchParams()
  // Re-initialise filters whenever the URL query changes (e.g. a navbar search).
  return <Browse key={params.toString()} />
}

export default function BrowsePage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
        <Gate>
          <Suspense>
            <BrowseWithParams />
          </Suspense>
        </Gate>
      </main>
      <Footer />
    </>
  )
}
