"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "cn"
import { Calendar, Check, Ellipsis, Image as ImageIcon, MapPin, MessageSquare, Plus, Search, Send, Shield } from "lucide-react"
import { toast } from "sonner"

import { Gate, useApp } from "@/components/app-provider"
import { Chip, EmptyState, Photo, LinkButton, PersonAvatar, Row, SegTabs } from "@/components/kit"
import { Navbar } from "@/components/site/navbar"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { fileToDataUrl, fmt, money, timeAgo } from "@/lib/format"
import { actions, listingById, personFor } from "@/lib/store"
import type { State, Thread } from "@/lib/types"

const SYSTEM_ICONS = { cal: Calendar, check: Check, pin: MapPin }
const QUICK: { label: string; text: string; icon?: "pin" }[] = [
  { label: "Confirm time", text: "Confirming our time — see you then!" },
  { label: "Share location", text: "I’ll be by the main entrance at the meeting spot.", icon: "pin" },
  { label: "Running late", text: "Running about 10 minutes late — sorry!" },
]

/** What this conversation is about: the renter's own try-on / rental, or a lender request. */
function contextFor(s: State, thread: Thread) {
  if (thread.role === "renting") {
    const rental = s.rentals.find((r) => r.listingId === thread.listingId && r.status !== "cancelled" && r.status !== "completed")
    if (rental) {
      const status = { requested: "Awaiting lender", confirmed: "Confirmed", active: "Picked up", returned: "Returned", completed: "Completed", cancelled: "Cancelled" }[rental.status]
      return { title: "About this rental", status, date: `${fmt(rental.start)} – ${fmt(rental.end, "MMM d")}`, time: rental.pickupTime, place: rental.place === "public" ? "Public spot" : "Lender’s home", href: `/rentals/${rental.id}`, cta: "View rental" }
    }
    const tryOn = s.tryOns.find((t) => t.listingId === thread.listingId && (t.status === "booked" || t.status === "requested"))
    if (tryOn) {
      return { title: "About this try-on", status: tryOn.status === "booked" ? "Try-on booked" : "Awaiting lender", date: fmt(tryOn.date), time: tryOn.time, place: tryOn.place === "public" ? "Public spot" : tryOn.place === "home" ? "Lender’s home" : "To be agreed", href: `/listing/${thread.listingId}/reserve`, cta: "Reserve outfit" }
    }
    return null
  }
  const request = s.requests.find((r) => r.listingId === thread.listingId && r.renterId === thread.personId && r.status !== "declined")
  if (!request) return null
  return {
    title: request.kind === "tryon" ? "About this try-on" : "About this request",
    status: { pending: "Waiting on you", accepted: "Accepted", completed: "Completed", declined: "Declined" }[request.status],
    date: request.end ? `${fmt(request.start)} – ${fmt(request.end, "MMM d")}` : fmt(request.start),
    time: request.time,
    place: request.place,
    href: "/lender/requests",
    cta: "View requests",
  }
}

function Messages() {
  const s = useApp()
  const router = useRouter()
  const params = useSearchParams()
  const [filter, setFilter] = useState<"all" | "renting" | "lending">("all")
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState("")
  const [composing, setComposing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const threads = s.threads.filter((t) => {
    if (filter !== "all" && t.role !== filter) return false
    if (!q) return true
    const listing = listingById(s, t.listingId)
    return `${personFor(s, t.personId).name} ${listing?.title ?? ""} ${t.messages.map((m) => m.text).join(" ")}`.toLowerCase().includes(q)
  })
  const selectedId = params.get("thread")
  const thread = s.threads.find((t) => t.id === selectedId) ?? threads[0]
  const person = thread && personFor(s, thread.personId)
  const listing = thread && listingById(s, thread.listingId)
  const context = thread && contextFor(s, thread)
  const messageCount = thread?.messages.length ?? 0
  const threadId = thread?.id

  useEffect(() => {
    if (threadId) actions.markThreadRead(threadId)
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [threadId, messageCount])

  const send = (text: string, extra?: { image?: string; icon?: "pin" }) => {
    if (!thread || (!text.trim() && !extra?.image)) return
    actions.sendMessage(thread.id, { text: text.trim(), ...extra })
  }
  const select = (id: string) => router.replace(`/messages?thread=${id}`, { scroll: false })

  // People the user already has a rental, try-on or request with but no thread yet.
  const contacts = [
    ...s.rentals.map((r) => ({ listingId: r.listingId, personId: listingById(s, r.listingId)?.lenderId, role: "renting" as const })),
    ...s.tryOns.map((t) => ({ listingId: t.listingId, personId: listingById(s, t.listingId)?.lenderId, role: "renting" as const })),
    ...s.requests.map((r) => ({ listingId: r.listingId, personId: r.renterId, role: "lending" as const })),
  ].filter((c, i, all) => c.personId && all.findIndex((x) => x.listingId === c.listingId && x.personId === c.personId) === i)

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_320px]">
      <aside className={cn("flex min-h-0 flex-col gap-4 border-r p-4", selectedId && "hidden md:flex")}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-[-0.48px]">Messages</h1>
          <Button variant="outline" size="icon" aria-label="New message" onClick={() => setComposing(true)}>
            <Plus />
          </Button>
        </div>
        <span className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages" aria-label="Search messages" className="pl-9" />
        </span>
        <SegTabs value={filter} onChange={setFilter} items={[{ value: "all", label: "All" }, { value: "renting", label: "Renting" }, { value: "lending", label: "Lending" }]} />
        <ul className="-mx-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {threads.length === 0 && <li className="px-2 py-6 text-sm text-muted-foreground">No conversations found.</li>}
          {threads.map((t) => {
            const p = personFor(s, t.personId)
            const l = listingById(s, t.listingId)
            const last = t.messages[t.messages.length - 1]
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => select(t.id)}
                  aria-current={t.id === thread?.id ? "true" : undefined}
                  className={cn("flex w-full items-start gap-3 rounded-[10px] p-3 text-left transition-colors hover:bg-muted", t.id === thread?.id && "bg-muted")}
                >
                  <PersonAvatar initials={p.initials} className="size-10" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{last ? timeAgo(last.at) : ""}</span>
                    </span>
                    <span className="truncate text-[13px] text-muted-foreground">{l?.title ?? "Outfit"} · {t.context}</span>
                    <span className="flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-[13px]", t.unread ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {last ? (last.image ? "Sent a photo" : last.text) : "No messages yet"}
                      </span>
                      {t.unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {thread && person ? (
        <section className={cn("flex min-h-0 min-w-0 flex-col", !selectedId && "hidden md:flex")}>
          <header className="flex h-[72px] shrink-0 items-center gap-3 border-b px-4">
            <Button variant="ghost" size="sm" className="md:hidden" onClick={() => router.replace("/messages")}>Back</Button>
            <PersonAvatar initials={person.initials} className="size-10" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="flex items-center gap-2 text-[15px] font-semibold">
                <span className="truncate">{person.name}</span>
                {person.verified && (
                  <Badge variant="outline">
                    <Shield /> ID verified
                  </Badge>
                )}
              </p>
              <p className="truncate text-[13px] text-muted-foreground">{person.replyTime || `${person.rentals} rentals · ${person.neighborhood}`}</p>
            </div>
            <LinkButton href={`/profile?id=${person.id}`} variant="outline" className="hidden sm:inline-flex">View profile</LinkButton>
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Conversation actions" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {listing && <DropdownMenuItem onClick={() => router.push(`/listing/${listing.id}`)}>View listing</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => router.push(`/profile?id=${person.id}`)}>View profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/help")}>Safety &amp; help</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6" aria-live="polite">
            {thread.messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">Say hello to {person.name.split(" ")[0]}.</p>}
            {thread.messages.map((m) => {
              if (m.from === "system") {
                const Icon = SYSTEM_ICONS[m.icon ?? "check"]
                return (
                  <p key={m.id} className="mx-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    <Icon className="size-3" /> {m.text}
                  </p>
                )
              }
              const mine = m.from === "me"
              return (
                <div key={m.id} className={cn("flex items-end gap-2", mine && "justify-end")}>
                  {!mine && <PersonAvatar initials={person.initials} className="size-7 text-[10px]" />}
                  <div className={cn("flex max-w-[70%] flex-col gap-2 rounded-2xl px-4 py-2.5 text-sm leading-normal", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>
                    {m.image && (
                      // eslint-disable-next-line @next/next/no-img-element -- user uploads are data URLs
                      <img src={m.image} alt="Shared photo" className="max-h-56 rounded-lg object-cover" />
                    )}
                    {m.text && (
                      <p className="flex items-center gap-1.5 [overflow-wrap:anywhere]">
                        {m.icon === "pin" && <MapPin className="size-3.5 shrink-0" />}
                        {m.text}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <footer className="flex shrink-0 flex-col gap-3 border-t p-4">
            <div className="flex flex-wrap gap-2">
              {QUICK.map((qk) => (
                <Chip key={qk.label} onClick={() => send(qk.text, { icon: qk.icon })}>{qk.label}</Chip>
              ))}
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                send(draft)
                setDraft("")
              }}
            >
              <Button type="button" variant="ghost" size="icon" aria-label="Attach a photo" onClick={() => fileInput.current?.click()}>
                <ImageIcon />
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (!file) return
                  try {
                    send("", { image: await fileToDataUrl(file, 480) })
                  } catch {
                    toast.error("That file couldn't be read as an image.")
                  }
                }}
              />
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" aria-label="Message" className="h-10 flex-1" />
              <Button type="submit" disabled={!draft.trim()} className="h-10">
                Send <Send />
              </Button>
            </form>
          </footer>
        </section>
      ) : (
        <section className="hidden items-center justify-center p-8 md:flex">
          <EmptyState icon={MessageSquare} title="No conversation selected" description="Message a lender from any listing, or a renter from your requests." />
        </section>
      )}

      {thread && listing && (
        <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l p-5 xl:flex">
          <h2 className="text-base font-semibold">{context?.title ?? "About this outfit"}</h2>
          <Photo label="Outfit photo" src={listing.photos[0]} alt={listing.title} className="h-[180px] shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold">{listing.title}</p>
            <p className="text-[13px] text-muted-foreground">Size {listing.size} · {money(listing.pricePerDay)} / day</p>
          </div>
          {context && (
            <>
              <Separator />
              <div className="flex flex-col gap-2.5">
                <Row label="Status" value={context.status} />
                <Row label="Date" value={context.date} />
                <Row label="Time" value={context.time} />
                <Row label="Place" value={context.place} />
              </div>
            </>
          )}
          <LinkButton href={`/listing/${listing.id}`} variant="outline">View listing</LinkButton>
          {context ? (
            <LinkButton href={context.href}>{context.cta}</LinkButton>
          ) : (
            thread.role === "renting" && listing.status === "listed" && <LinkButton href={`/listing/${listing.id}/reserve`}>Reserve outfit</LinkButton>
          )}
          <Separator />
          <p className="flex items-start gap-2 text-xs leading-normal text-muted-foreground">
            <Shield className="mt-0.5 size-3.5 shrink-0" /> Keep payments and chat in the app, and meet in a public place for handoffs when you can.
          </p>
        </aside>
      )}

      <Dialog open={composing} onOpenChange={setComposing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
            <DialogDescription>Message someone you have a rental, try-on or request with.</DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {contacts.map((c) => {
              const p = personFor(s, c.personId!)
              const l = listingById(s, c.listingId)
              return (
                <li key={`${c.personId}-${c.listingId}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted"
                    onClick={() => {
                      const existing = s.threads.find((t) => t.personId === c.personId && t.listingId === c.listingId)
                      select(existing?.id ?? actions.openThread(c.personId!, c.listingId, c.role === "lending" ? "Request" : "Rental", c.role))
                      setComposing(false)
                    }}
                  >
                    <PersonAvatar initials={p.initials} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="truncate text-[13px] text-muted-foreground">{l?.title} · {c.role === "lending" ? "Your renter" : "Your lender"}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Navbar />
      <main className="flex min-h-0 flex-1 flex-col">
        <Gate auth>
          <Suspense>
            <Messages />
          </Suspense>
        </Gate>
      </main>
    </div>
  )
}
