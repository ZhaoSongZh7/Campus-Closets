"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Ellipsis, Plus, Search, Shirt, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import { useApp } from "@/components/app-provider"
import { EmptyState, Photo, LinkButton, PageTitle, Rating, SegTabs } from "@/components/kit"
import { LenderShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { compactRange, fmtShort, money } from "@/lib/format"
import { actions, isRentedNow, nextBooking } from "@/lib/store"
import type { Listing } from "@/lib/types"

type Status = "listed" | "rented" | "paused" | "draft"
type Tab = "all" | Status
const PAGE_SIZE = 8

const statusOf = (l: Listing): Status => (l.status === "listed" && isRentedNow(l) ? "rented" : l.status)
const BADGE: Record<Status, { label: string; variant: "success" | "warning" | "outline" | "secondary" }> = {
  listed: { label: "Listed", variant: "success" },
  rented: { label: "Rented", variant: "warning" },
  paused: { label: "Paused", variant: "outline" },
  draft: { label: "Draft", variant: "secondary" },
}
const isPublishable = (l: Listing) => Boolean(l.title.trim() && l.category && l.size && l.pricePerDay > 0)

function Closet() {
  const s = useApp()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("all")
  const [query, setQuery] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [removing, setRemoving] = useState<Listing | null>(null)

  const mine = s.listings.filter((l) => l.lenderId === "me")
  const count = (st: Status) => mine.filter((l) => statusOf(l) === st).length
  const allCategories = [...new Set(mine.map((l) => l.category))].sort()
  const q = query.trim().toLowerCase()
  const rows = mine.filter(
    (l) =>
      (tab === "all" || statusOf(l) === tab) &&
      (!q || `${l.title} ${l.category} ${l.size}`.toLowerCase().includes(q)) &&
      (!categories.length || categories.includes(l.category))
  )
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const toggleListed = (l: Listing, on: boolean) => {
    if (on && !isPublishable(l)) {
      toast.error("Add a title, category, size and price before listing this item.")
      router.push(`/lender/closet/new?edit=${l.id}`)
      return
    }
    actions.setListingStatus(l.id, on ? "listed" : "paused")
    toast.success(on ? `${l.title} is now listed` : `${l.title} is paused`)
  }

  return (
    <>
      <PageTitle title="My closet" description="Manage listings, pricing, and availability.">
        <LinkButton href="/lender/closet/new">
          <Plus /> List an item
        </LinkButton>
      </PageTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegTabs
          value={tab}
          onChange={(v) => {
            setTab(v)
            setPage(1)
          }}
          items={[
            { value: "all", label: `All (${mine.length})` },
            { value: "listed", label: `Listed (${count("listed")})` },
            { value: "rented", label: `Rented (${count("rented")})` },
            { value: "paused", label: `Paused (${count("paused")})` },
            { value: "draft", label: `Drafts (${count("draft")})` },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="relative w-[260px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search your closet" aria-label="Search your closet" className="pl-9" />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })}>
              <SlidersHorizontal /> Filter{categories.length ? ` (${categories.length})` : ""}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {allCategories.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c}
                  checked={categories.includes(c)}
                  onCheckedChange={(on) => {
                    setCategories(on ? [...categories, c] : categories.filter((x) => x !== c))
                    setPage(1)
                  }}
                >
                  {c}
                </DropdownMenuCheckboxItem>
              ))}
              {categories.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCategories([])}>Clear filter</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Shirt} title={mine.length ? "No items match" : "Your closet is empty"} description={mine.length ? "Try another tab or clear the search." : "List your first outfit to start earning from it."}>
          {!mine.length && <LinkButton href="/lender/closet/new">List an item</LinkButton>}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Item", "Status", "Price / day", "Rentals", "Rating", "Next booking", "Listed"].map((h) => (
                  <TableHead key={h} className="h-10 px-4 text-[11px] font-semibold tracking-[0.66px] text-muted-foreground uppercase">{h}</TableHead>
                ))}
                <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((l) => {
                const status = statusOf(l)
                const rented = isRentedNow(l)
                const next = nextBooking(l)
                return (
                  <TableRow key={l.id}>
                    <TableCell className="px-4 py-3">
                      <Link href={`/listing/${l.id}`} className="group flex items-center gap-3">
                        <Photo src={l.photos[0]} alt={l.title} className="h-12 w-10 shrink-0 rounded-md" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm font-semibold group-hover:underline">{l.title || "Untitled outfit"}</span>
                          <span className="text-[13px] text-muted-foreground">{l.category || "No category"} · {l.size ? (/^\d/.test(l.size) ? l.size : `Size ${l.size}`) : "No size"}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="px-4"><Badge variant={BADGE[status].variant}>{BADGE[status].label}</Badge></TableCell>
                    <TableCell className="px-4 font-medium">{money(l.pricePerDay)}</TableCell>
                    <TableCell className="px-4">{l.rentals}</TableCell>
                    <TableCell className="px-4">{l.reviewCount ? <Rating value={l.rating} /> : "—"}</TableCell>
                    <TableCell className="px-4 text-[13px] text-muted-foreground">
                      {rented ? `Out until ${fmtShort(rented.end)}` : next ? compactRange(next.start, next.end) : "—"}
                    </TableCell>
                    <TableCell className="px-4">
                      <Switch checked={l.status === "listed"} onCheckedChange={(on) => toggleListed(l, on)} aria-label={`${l.title} listed`} />
                    </TableCell>
                    <TableCell className="pr-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger aria-label={`Actions for ${l.title}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                          <Ellipsis />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => router.push(`/listing/${l.id}`)}>View listing</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/lender/closet/new?edit=${l.id}`)}>Edit</DropdownMenuItem>
                          {l.status !== "draft" && (
                            <DropdownMenuItem onClick={() => toggleListed(l, l.status !== "listed")}>{l.status === "listed" ? "Pause" : "Resume"}</DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setRemoving(l)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">Showing {visible.length} of {rows.length} items</p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>
            <ChevronLeft /> Previous
          </Button>
          <Button variant="outline" disabled={current === pages} onClick={() => setPage(current + 1)}>
            Next <ChevronRight />
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{removing?.title}”?</DialogTitle>
            <DialogDescription>
              {removing && (isRentedNow(removing) || nextBooking(removing))
                ? "This item has a current or upcoming booking. Deleting it removes the listing but not your commitment to that renter."
                : "This removes the listing and its photos from your closet. It can’t be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Keep item</Button>
            <Button
              variant="destructive"
              onClick={() => {
                actions.deleteListing(removing!.id)
                toast.success("Listing deleted")
                setRemoving(null)
              }}
            >
              Delete listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function ClosetPage() {
  return (
    <LenderShell>
      <Closet />
    </LenderShell>
  )
}
