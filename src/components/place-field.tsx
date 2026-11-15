"use client"

import { useState } from "react"
import { Loader2, LocateFixed, MapPin } from "lucide-react"
import { toast } from "sonner"

import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { actions } from "@/lib/store"
import type { Place } from "@/lib/types"

const TYPE_INSTEAD = "Type a ZIP code or “City, ST” instead."

/** Asks the browser where the device is, then asks the server which ZIP code area that is. */
export function useLocate(onPlace: (place: Place) => void) {
  const [locating, setLocating] = useState(false)

  function locate() {
    if (locating) return
    if (typeof navigator === "undefined" || !navigator.geolocation || !window.isSecureContext) {
      toast.error(`This browser can’t share its location here. ${TYPE_INSTEAD}`)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const place = await actions.findPlace({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocating(false)
        if (place) onPlace(place)
        else toast.error(`We couldn’t match your location to a US or Canadian ZIP code. ${TYPE_INSTEAD}`)
      },
      (error) => {
        setLocating(false)
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? `Location access is turned off for this site. Allow it in your browser’s site settings, or type your area. ${TYPE_INSTEAD}`
            : `We couldn’t get your location just now. Try again. ${TYPE_INSTEAD}`
        )
      },
      // A rough fix is plenty: only the surrounding ZIP code area is used.
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 }
    )
  }

  return { locating, locate }
}

/** The round "use my current location" button that sits at the end of a place field. */
export function LocateButton({ locating, onClick, className }: { locating: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locating}
      aria-label="Use my current location"
      title="Use my current location"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none",
        className
      )}
    >
      {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
    </button>
  )
}

/** A text field for a place ("ZIP" or "City, ST") with a button that fills it from the device's location. */
export function PlaceField({
  value,
  onChange,
  onPlace,
  className,
  ...input
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "className"> & {
  value: string
  onChange: (value: string) => void
  /** Called when the device's location was matched, after `onChange` got its label. */
  onPlace?: (place: Place) => void
  className?: string
}) {
  const { locating, locate } = useLocate((place) => {
    onChange(place.label)
    onPlace?.(place)
  })
  return (
    <span className={cn("relative", className)}>
      <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input {...input} value={value} onChange={(e) => onChange(e.target.value)} className="pr-10 pl-9" />
      <LocateButton locating={locating} onClick={locate} className="absolute top-1/2 right-1.5 -translate-y-1/2" />
    </span>
  )
}
