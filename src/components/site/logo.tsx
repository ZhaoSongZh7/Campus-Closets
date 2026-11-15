import Image from "next/image"
import Link from "next/link"

import logo from "@/assets/campus-closet-logo.jpeg"
import { cn } from "cn"

export const BRAND = "Campus Closet"

/** The logo artwork as a rounded tile, with the name beside it. `className` sizes the tile. */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2.5">
      <Image src={logo} alt="" sizes="96px" priority className={cn("size-10 rounded-lg object-cover", className)} />
      <span className="text-base font-semibold">{BRAND}</span>
    </Link>
  )
}
