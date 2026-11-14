import Link from "next/link"
import { Shirt } from "lucide-react"

export const BRAND = "Mutuari"

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Shirt className="size-4" />
      </span>
      <span className="text-base font-semibold">{BRAND}</span>
    </Link>
  )
}
