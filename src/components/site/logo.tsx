import Image from "next/image"
import Link from "next/link"

import logo from "@/assets/campus-closet.jpeg"
import { cn } from "cn"

export const BRAND = "Campus Closets"

/** The logo already spells out the name, so it stands alone with no text beside it. */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label={`${BRAND} home`} className="flex shrink-0 items-center">
      <Image src={logo} alt={BRAND} unoptimized priority className={cn("h-13 w-auto", className)} />
    </Link>
  )
}
