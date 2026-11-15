"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Calendar,
  Camera,
  Check,
  CreditCard,
  Leaf,
  MapPin,
  Search,
  Shield,
  Shirt,
  ShoppingBag,
  Star,
  Undo2,
} from "lucide-react"

import { useMaybeApp } from "@/components/app-provider"
import { DateRangeField, Photo, LinkButton, Panel, SimpleSelect } from "@/components/kit"
import { ListingCard } from "@/components/listing-card"
import { LocateButton, useLocate } from "@/components/place-field"
import { Footer } from "@/components/site/footer"
import { Navbar } from "@/components/site/navbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OCCASIONS, PLATFORM_FEE_RATE, SIZES } from "@/lib/format"
import { actions } from "@/lib/store"

const occasionTiles = [
  { label: "Weddings", value: "Wedding", image: "/art/occasion-wedding.jpg" },
  { label: "Interviews", value: "Interview", image: "/art/occasion-interview.jpg" },
  { label: "Parties", value: "Party", image: "/art/occasion-party.jpg" },
  { label: "Formal events", value: "Formal event", image: "/art/occasion-formal.jpg" },
  { label: "Graduations", value: "Graduation", image: "/art/occasion-graduation.jpg" },
  { label: "Date night", value: "Date night", image: "/art/occasion-date.jpg" },
]

const steps = [
  { icon: Search, title: "Browse nearby closets", text: "Filter by size, style, occasion and distance to find outfits a short trip away." },
  { icon: Calendar, title: "Book a try-on", text: "Meet the lender and try the outfit on before you commit. Try-ons are free." },
  { icon: CreditCard, title: "Reserve your dates", text: "Request your dates. You're only charged once the lender accepts." },
  { icon: Undo2, title: "Pick up and return", text: "Hand off in person, take condition photos together, and return it on time." },
]

const trust = [
  { icon: Star, title: "Reviews from real rentals", text: "Only people who completed a rental can review an outfit or a lender." },
  { icon: Camera, title: "Condition photos at pickup and return", text: "Both sides see the same time-stamped photos, so there's no guessing later." },
  { icon: Shield, title: "Clear cleaning and damage policies", text: "Every listing spells out who cleans, what the deposit covers, and late fees." },
]

function SectionHeading({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-end gap-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <h2 className="text-[28px] leading-tight font-semibold tracking-[-0.56px]">{title}</h2>
        <p className="text-[15px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

function SearchBar() {
  const router = useRouter()
  const [location, setLocation] = useState("")
  const { locating, locate } = useLocate((place) => {
    setLocation(place.label)
    actions.setNear(place)
  })
  const [start, setStart] = useState<string>()
  const [end, setEnd] = useState<string>()
  const [size, setSize] = useState("")
  const [occasion, setOccasion] = useState("")
  const cell = "flex min-w-0 flex-1 flex-col gap-1 px-3 py-2"
  const cellLabel = "text-xs font-semibold"
  const divider = <span className="hidden h-9 w-px shrink-0 bg-border md:block" />

  return (
    <form
      className="flex w-full flex-col gap-1 rounded-2xl border bg-card p-2 shadow-card md:flex-row md:items-center"
      onSubmit={(e) => {
        e.preventDefault()
        const params = new URLSearchParams()
        if (location.trim()) params.set("near", location.trim())
        if (start) params.set("start", start)
        if (end) params.set("end", end)
        if (size) params.set("size", size)
        if (occasion) params.set("occasion", occasion)
        router.push(`/browse${params.size ? `?${params}` : ""}`)
      }}
    >
      <div className={`${cell} md:flex-[1.7]`}>
        <label htmlFor="search-location" className={cellLabel}>
          Location
        </label>
        <span className="flex items-center gap-1">
          {/* The location button stands where the pin icon would be. */}
          <LocateButton locating={locating} onClick={locate} className="-my-1.5 -ml-1.5" />
          <input
            id="search-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City or ZIP"
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </span>
      </div>
      {divider}
      <div className={cell}>
        <span className={cellLabel}>Dates</span>
        <DateRangeField
          bare
          start={start}
          end={end}
          onChange={(a, b) => {
            setStart(a)
            setEnd(b)
          }}
        />
      </div>
      {divider}
      <div className={cell}>
        <span className={cellLabel}>Size</span>
        <span className="flex items-center gap-1.5">
          <Shirt className="size-3.5 shrink-0 text-muted-foreground" />
          <SimpleSelect
            value={size}
            onChange={setSize}
            options={SIZES}
            placeholder="Any size"
            ariaLabel="Size"
            className="h-5 border-0 p-0 shadow-none data-[size=default]:h-5 [&>svg]:hidden"
          />
        </span>
      </div>
      {divider}
      <div className={cell}>
        <span className={cellLabel}>Occasion</span>
        <span className="flex items-center gap-1.5">
          <ShoppingBag className="size-3.5 shrink-0 text-muted-foreground" />
          <SimpleSelect
            value={occasion}
            onChange={setOccasion}
            options={OCCASIONS}
            placeholder="Any occasion"
            ariaLabel="Occasion"
            className="h-5 border-0 p-0 shadow-none data-[size=default]:h-5 [&>svg]:hidden"
          />
        </span>
      </div>
      <Button type="submit" size="lg">
        <Search /> Search
      </Button>
    </form>
  )
}

export default function LandingPage() {
  const s = useMaybeApp()
  const listed = (s?.listings ?? []).filter((l) => l.status === "listed" && l.lenderId !== "me")
  const popular = [...listed].sort((a, b) => (a.distance ?? 1e6) - (b.distance ?? 1e6)).slice(0, 4)
  const lenders = new Set(listed.map((l) => l.lenderId)).size
  const completed = listed.reduce((n, l) => n + l.rentals, 0)
  const stats = [
    { value: listed.length, label: "Outfits listed nearby" },
    { value: completed, label: "Rentals completed" },
    { value: lenders, label: "Local lenders" },
  ]

  return (
    <>
      <Navbar marketing />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col">
        <section className="flex flex-col items-center gap-10 px-4 py-12 md:px-8 lg:flex-row lg:gap-16 xl:px-20 xl:py-[72px]">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-6">
            <Badge variant="outline">
              <MapPin /> Local · Peer-to-peer · Try before you rent
            </Badge>
            <h1 className="text-4xl leading-[1.1] font-semibold tracking-[-0.03em] md:text-[56px]">
              Rent outfits from closets nearby
            </h1>
            <p className="text-lg leading-normal text-muted-foreground">
              Borrow occasion wear from people in your neighborhood. Try it on in person, reserve your dates, and pick
              up and return close to home.
            </p>
            <SearchBar />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {["In-person try-ons", "Condition photos", "Clear cleaning & damage policy"].map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                  <Check className="size-3.5" />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <Photo src="/art/hero.jpg" alt="Outfits hanging on a clothing rail" className="h-[320px] w-full shrink-0 rounded-3xl lg:h-[560px] lg:w-[520px]" />
        </section>

        <section className="flex flex-col gap-6 px-4 py-10 md:px-8 xl:px-20">
          <SectionHeading title="Browse by occasion" description="Start with where you're going." />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {occasionTiles.map((o) => (
              <Link key={o.value} href={`/browse?occasion=${encodeURIComponent(o.value)}`} className="group flex flex-col gap-3">
                <Photo src={o.image} alt="" className="h-40 w-full transition-opacity group-hover:opacity-85" />
                <span className="text-sm font-medium">{o.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-6 px-4 py-10 md:px-8 xl:px-20">
          <SectionHeading title="Popular near you" description="The closest outfits available to rent right now.">
            <LinkButton href="/browse" variant="outline">
              View all <ArrowRight />
            </LinkButton>
          </SectionHeading>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {popular.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
            {!s && [0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] w-full animate-pulse rounded-xl bg-muted" />)}
          </div>
        </section>
      </main>

      <section id="how-it-works" className="scroll-mt-16 border-y bg-subtle">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-16 md:px-8 xl:px-20">
          <SectionHeading title="How it works" description="Four steps from browsing to handing it back." />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <Panel key={step.title} className="gap-3">
                <span className="flex size-10 items-center justify-center rounded-[10px] bg-muted">
                  <step.icon className="size-[18px]" />
                </span>
                <p className="text-[11px] font-semibold tracking-[0.66px] text-muted-foreground">STEP {i + 1}</p>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-normal text-muted-foreground">{step.text}</p>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        <section className="grid gap-6 px-4 py-16 md:px-8 lg:grid-cols-2 xl:px-20">
          <Panel id="trust" className="scroll-mt-20 gap-6 p-8">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-semibold">Built on trust</h2>
              <p className="text-sm text-muted-foreground">What keeps a rental fair for both sides.</p>
            </div>
            {trust.map((t) => (
              <div key={t.title} className="flex items-start gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <t.icon className="size-4" />
                </span>
                <div className="flex flex-1 flex-col gap-1">
                  <p className="text-[15px] font-semibold">{t.title}</p>
                  <p className="text-sm leading-normal text-muted-foreground">{t.text}</p>
                </div>
              </div>
            ))}
          </Panel>
          <Panel id="sustainability" className="scroll-mt-20 gap-6 p-8">
            <div className="flex flex-col items-start gap-2.5">
              <Badge variant="success">
                <Leaf /> Sustainability
              </Badge>
              <h2 className="text-2xl font-semibold">Wear more, buy less</h2>
              <p className="text-sm leading-normal text-muted-foreground">
                Renting helps most when it replaces buying something new. The real impact also depends on how you
                travel to the handoff and how the outfit is cleaned, so we keep rentals local.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="flex flex-col gap-1 rounded-[10px] border bg-subtle p-4">
                  <p className="text-2xl font-semibold">{s ? stat.value : "–"}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
            <Photo src="/art/cover-2.jpg" alt="A rail of outfits shared between neighbours" className="h-[120px] w-full" />
          </Panel>
        </section>

        <section className="px-4 pb-16 md:px-8 xl:px-20">
          <div className="flex flex-col items-start gap-8 rounded-3xl bg-primary p-8 md:flex-row md:items-center md:p-12">
            <div className="flex flex-1 flex-col gap-3">
              <h2 className="text-[32px] leading-tight font-semibold tracking-[-0.64px] text-primary-foreground">
                Earn from the outfits you already own
              </h2>
              <p className="text-base leading-normal text-ring">
                You set the price and the handoff. Lenders keep {Math.round((1 - PLATFORM_FEE_RATE) * 100)}% of each
                completed rental; the platform takes {Math.round(PLATFORM_FEE_RATE * 100)}%.
              </p>
            </div>
            <LinkButton href="/lender/closet/new" variant="secondary" size="lg">
              Start lending <ArrowRight />
            </LinkButton>
          </div>
        </section>
      </div>
      <Footer />
    </>
  )
}
