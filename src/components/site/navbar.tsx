"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "cn"
import { Bell, Heart, LogOut, MessageSquare, Plus, Search, Settings, Shirt, User } from "lucide-react"

import { useMaybeApp } from "@/components/app-provider"
import { LinkButton, PersonAvatar } from "@/components/kit"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { initialsOf, timeAgo } from "@/lib/format"
import { actions, currentAccount, unreadCount } from "@/lib/store"

import { Logo } from "./logo"

const appLinks = [
  { href: "/browse", label: "Browse", match: ["/browse", "/listing"] },
  { href: "/rentals?tab=tryons", label: "Try-ons", match: [] as string[] },
  { href: "/rentals", label: "My rentals", match: ["/rentals"] },
  { href: "/lender", label: "Lend", match: ["/lender"] },
]

const marketingLinks = [
  { href: "/browse", label: "Browse" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/lender", label: "Lend your closet" },
  { href: "/#sustainability", label: "Sustainability" },
]

function AppLinks({ pathname }: { pathname: string }) {
  return appLinks.map((l) => (
    <Link
      key={l.href}
      href={l.href}
      className={cn(
        "whitespace-nowrap hover:text-foreground",
        l.match.some((m) => pathname.startsWith(m)) ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {l.label}
    </Link>
  ))
}

/** Reads the URL, so it must render inside <Suspense> on dynamic routes. */
function ActiveAppLinks() {
  return <AppLinks pathname={usePathname()} />
}

function AccountMenu() {
  const s = useMaybeApp()
  const router = useRouter()
  const account = s ? currentAccount(s) : null
  if (!account) return null
  const name = `${account.firstName} ${account.lastName}`.trim()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <PersonAvatar initials={initialsOf(name)} src={account.avatar} className="size-8" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{account.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")}>
          <User /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/lender")}>
          <Shirt /> Lender dashboard
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void actions.logOut().then(() => router.push("/"))
          }}
        >
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Notifications() {
  const s = useMaybeApp()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const items = s?.notifications ?? []
  const unread = items.some((n) => !n.read)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) actions.markNotificationsRead()
      }}
    >
      <PopoverTrigger
        aria-label="Notifications"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
      >
        <Bell />
        {unread && <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <p className="border-b px-4 py-3 text-sm font-semibold">Notifications</p>
        {items.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">You&apos;re all caught up.</p>}
        <ul className="max-h-80 overflow-y-auto">
          {items.slice(0, 12).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  actions.markNotificationsRead()
                  router.push(n.href)
                }}
                className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-muted"
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[13px] leading-snug">{n.text}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(n.at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export function Navbar({ marketing = false }: { marketing?: boolean }) {
  const s = useMaybeApp()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const account = s ? currentAccount(s) : null
  const unread = s ? unreadCount(s) : 0

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-4 border-b bg-background px-4 md:gap-8 md:px-8">
      <Logo href={account && !marketing ? "/browse" : "/"} />
      <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
        {marketing
          ? marketingLinks.map((l) => (
              <Link key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground">
                {l.label}
              </Link>
            ))
          : (
              <Suspense fallback={<AppLinks pathname="" />}>
                <ActiveAppLinks />
              </Suspense>
            )}
      </nav>
      <div className="flex-1" />
      {!marketing && (
        <form
          role="search"
          className="relative hidden w-80 lg:block"
          onSubmit={(e) => {
            e.preventDefault()
            router.push(query.trim() ? `/browse?q=${encodeURIComponent(query.trim())}` : "/browse")
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search outfits, styles, occasions…"
            aria-label="Search outfits"
            className="pl-9"
          />
        </form>
      )}
      {account ? (
        <>
          {marketing ? (
            <LinkButton href="/browse">Browse outfits</LinkButton>
          ) : (
            <>
              <LinkButton href="/lender/closet/new" variant="outline" className="hidden sm:inline-flex">
                <Plus /> List an item
              </LinkButton>
              <div className="flex items-center gap-1">
                <LinkButton href="/browse?saved=1" variant="ghost" size="icon" aria-label="Saved outfits">
                  <Heart />
                </LinkButton>
                <LinkButton href="/messages" variant="ghost" size="icon" aria-label="Messages" className="relative">
                  <MessageSquare />
                  {unread > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive" />}
                </LinkButton>
                <Notifications />
              </div>
            </>
          )}
          <AccountMenu />
        </>
      ) : (
        <div className="flex items-center gap-2">
          <LinkButton href="/login" variant="ghost">
            Log in
          </LinkButton>
          <LinkButton href="/signup">Sign up</LinkButton>
        </div>
      )}
    </header>
  )
}

export function MinimalHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 md:px-8">
      <Logo />
      {children}
    </header>
  )
}

