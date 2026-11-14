import Link from "next/link"
import { cn } from "cn"

import { Photo, Rating } from "@/components/kit"
import { Badge } from "@/components/ui/badge"
import { money, whereLabel } from "@/lib/format"
import type { Listing } from "@/lib/types"

export function ListingCard({
  listing,
  imageClassName,
  preview,
}: {
  listing: Listing
  imageClassName?: string
  /** Render without a link (used by the "List an item" live preview). */
  preview?: boolean
}) {
  const mine = listing.lenderId === "me"
  const body = (
    <>
      <Photo
        label="Outfit photo"
        src={listing.photos[0] ?? listing.condition.front}
        alt={listing.title}
        className={cn("aspect-[4/5] w-full", imageClassName)}
      />
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold group-hover:underline">
            {listing.title || "Untitled outfit"}
          </p>
          <Rating value={listing.rating} className="mt-0.5" />
        </div>
        <p className="text-[13px] text-muted-foreground">
          Size {listing.size || "—"} · {mine ? "Your listing" : whereLabel(listing)}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold">{money(listing.pricePerDay || 0)}</span>
          <span className="text-[13px] text-muted-foreground">/ day</span>
          {listing.tryOn && <Badge variant="outline">Try-on available</Badge>}
        </div>
      </div>
    </>
  )
  if (preview) return <div className="flex flex-col gap-3">{body}</div>
  return (
    <Link href={`/listing/${listing.id}`} className="group flex min-w-0 flex-col gap-3">
      {body}
    </Link>
  )
}
