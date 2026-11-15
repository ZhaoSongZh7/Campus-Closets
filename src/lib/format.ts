import { addDays, differenceInCalendarDays, format, isToday, isTomorrow, parseISO } from "date-fns"

export const SERVICE_FEE_RATE = 0.08
export const PLATFORM_FEE_RATE = 0.2

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL"]
export const STYLES = [
  "Classic",
  "Minimal",
  "Bold",
  "Vintage",
  "Streetwear",
  "Romantic",
  "Formal",
  "Black tie",
  "Boho",
  "Preppy",
  "Cultural / traditional",
]
export const OCCASIONS = ["Wedding", "Interview", "Party", "Formal event", "Graduation", "Date night"]
export const CATEGORIES = ["Dress", "Gown", "Suit", "Tuxedo", "Blazer", "Jacket", "Trousers", "Jumpsuit", "Set", "Skirt", "Top", "Costume"]
export const COLORS = ["Black", "White", "Ivory", "Navy", "Grey", "Red", "Burgundy", "Emerald", "Blue", "Pink", "Gold", "Multi"]
export const TIME_SLOTS = ["10:00 AM", "10:30 AM", "11:00 AM", "1:00 PM", "2:30 PM", "4:00 PM", "5:30 PM", "6:00 PM"]
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export const iso = (d: Date) => format(d, "yyyy-MM-dd")
export const todayISO = () => iso(new Date())
export const addDaysISO = (n: number, from: Date = new Date()) => iso(addDays(from, n))
export const toDate = (s: string) => parseISO(s)

export const fmt = (s: string, pattern = "EEE, MMM d") => format(parseISO(s), pattern)
export const fmtShort = (s: string) => format(parseISO(s), "MMM d")

export function relDay(s: string) {
  const d = parseISO(s)
  if (isToday(d)) return "Today"
  if (isTomorrow(d)) return "Tomorrow"
  return format(d, "EEE, MMM d")
}

export function range(start: string, end: string) {
  return `${fmtShort(start)} – ${fmtShort(end)}`
}

export function compactRange(start: string, end: string) {
  const a = parseISO(start)
  const b = parseISO(end)
  if (a.getMonth() === b.getMonth()) return `${format(a, "MMM d")}–${format(b, "d")}`
  return `${format(a, "MMM d")} – ${format(b, "MMM d")}`
}

export const rentalDays = (start: string, end: string) =>
  Math.max(1, differenceInCalendarDays(parseISO(end), parseISO(start)))

export function money(n: number) {
  return Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export const money2 = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function quote(pricePerDay: number, days: number, cleaningFee: number) {
  const subtotal = pricePerDay * days
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE)
  return { subtotal, serviceFee, cleaningFee, total: subtotal + cleaningFee + serviceFee }
}

export function lenderEarn(total: number) {
  const fee = Math.round(total * PLATFORM_FEE_RATE)
  return { fee, earn: total - fee }
}

export function timeAgo(ts: number) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days === 1) return "Yesterday"
  return format(new Date(ts), "MMM d")
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("")

export const uid = (prefix = "") => `${prefix}${Math.random().toString(36).slice(2, 9)}`

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd
}

/** Downscale an uploaded image so it fits comfortably in local storage. */
export function fileToDataUrl(file: File, max = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read file"))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("Not an image"))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/jpeg", 0.72))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** Miles between two points, as the crow flies. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * "About 3 mi away", or the pickup area when the distance isn't known. Distances run
 * between ZIP code areas, so they are rounded and the same area reads "In your area".
 */
export function whereLabel(l: { distance: number | null; pickupArea: string }) {
  if (l.distance === null) return l.pickupArea || "Nearby"
  return l.distance < 1 ? "In your area" : `About ${Math.round(l.distance)} mi away`
}
