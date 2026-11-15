import Link from "next/link"

import { BRAND, Logo } from "./logo"

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/help#policy", label: "Cleaning & damage policy" },
  { href: "/#sustainability", label: "Sustainability" },
  { href: "/help", label: "Help" },
]

export function Footer() {
  return (
    <footer className="flex min-h-[72px] flex-wrap items-center gap-x-6 gap-y-2 border-t bg-background px-4 py-4 md:px-8">
      <Logo className="size-8" />
      <p className="text-[13px] text-muted-foreground">
        © 2026 {BRAND}. Rent occasion wear from closets nearby.
      </p>
      <div className="flex-1" />
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="text-[13px] text-muted-foreground hover:text-foreground">
          {l.label}
        </Link>
      ))}
    </footer>
  )
}
