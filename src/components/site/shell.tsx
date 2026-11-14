"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "cn"
import { DollarSign, Inbox, LayoutGrid, MessageSquare, Plus, Shirt, SlidersHorizontal, User } from "lucide-react"

import { Gate, useMaybeApp } from "@/components/app-provider"
import { LinkButton } from "@/components/kit"

import { Footer } from "./footer"
import { Navbar } from "./navbar"

/** Standard page chrome: navbar, centred content column, footer. */
export function AppShell({
  auth = false,
  className,
  children,
}: {
  auth?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 flex-col">
        <Gate auth={auth}>
          <div className={cn("mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-8 xl:px-20", className)}>
            <Suspense>{children}</Suspense>
          </div>
        </Gate>
      </main>
      <Footer />
    </>
  )
}

const lending = [
  { href: "/lender", label: "Overview", icon: LayoutGrid },
  { href: "/lender/closet", label: "My closet", icon: Shirt },
  { href: "/lender/requests", label: "Requests", icon: Inbox },
  { href: "/lender/earnings", label: "Earnings", icon: DollarSign },
]
const account = [
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
]

function SidebarGroup({ title, items }: { title: string; items: typeof lending }) {
  const pathname = usePathname()
  const s = useMaybeApp()
  const pending = s?.requests.filter((r) => r.status === "pending").length ?? 0
  return (
    <div className="flex flex-col gap-1">
      <p className="px-0 pb-1 text-[11px] font-semibold tracking-[0.66px] text-muted-foreground uppercase">{title}</p>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/lender" ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
            {href === "/lender/requests" && pending > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-primary-foreground">
                {pending}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

/** Lender dashboard chrome: navbar plus the lending sidebar. */
export function LenderShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r bg-subtle px-4 py-6 lg:flex">
          <LinkButton href="/lender/closet/new" className="w-full">
            <Plus /> List an item
          </LinkButton>
          <Suspense>
            <SidebarGroup title="Lending" items={lending} />
            <SidebarGroup title="Account" items={account} />
          </Suspense>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <Gate auth>
            <div className="flex w-full max-w-[1184px] flex-col gap-6 p-4 md:p-8">
              <Suspense>{children}</Suspense>
            </div>
          </Gate>
        </main>
      </div>
    </>
  )
}
