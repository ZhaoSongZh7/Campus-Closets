export type Person = {
  id: string
  name: string
  initials: string
  verified: boolean
  rentals: number
  rating: number
  replyTime: string
  memberSince: number
  neighborhood: string
}

export type PhotoKey = "front" | "back" | "label" | "wear"
export type PhotoSet = Partial<Record<PhotoKey, string>>

export type ListingStatus = "listed" | "paused" | "draft"

export type Listing = {
  id: string
  title: string
  category: string
  brand: string
  color: string
  /** Display size, e.g. "M" or "40R" */
  size: string
  /** Letter size used by filters (XS–XXL) */
  sizeGroup: string
  sizeNote: string
  fit: string
  description: string
  occasions: string[]
  styles: string[]
  pricePerDay: number
  minDays: number
  deposit: number
  cleaningFee: number
  cleaningIncluded: boolean
  tryOn: boolean
  /** "me" for the signed-in user's own closet */
  lenderId: string
  /** Miles from the viewer. Null when unknown (no geocoding yet). */
  distance: number | null
  rating: number
  reviewCount: number
  rentals: number
  photos: string[]
  condition: PhotoSet
  status: ListingStatus
  booked: { start: string; end: string }[]
  pickupArea: string
  handoff: string[]
  days: string[]
  careNotes: string
  createdAt: string
}

export type RentalStatus =
  | "requested"
  | "confirmed"
  | "active"
  | "returned"
  | "completed"
  | "cancelled"

export type Rental = {
  id: string
  code: string
  listingId: string
  status: RentalStatus
  start: string
  end: string
  eventDate?: string
  pickupTime: string
  returnTime: string
  place: "public" | "home"
  days: number
  subtotal: number
  cleaningFee: number
  serviceFee: number
  total: number
  deposit: number
  handoffCode: string
  pickupChecklist: boolean[]
  pickupPhotos: PhotoSet
  returnChecklist: boolean[]
  returnPhotos: PhotoSet
  reviewed: boolean
  triedOn?: string
  createdAt: string
}

export type TryOnStatus = "requested" | "booked" | "done" | "cancelled"

export type TryOn = {
  id: string
  listingId: string
  date: string
  time: string
  place: "public" | "home" | "other"
  note: string
  status: TryOnStatus
  createdAt: string
}

export type LenderRequest = {
  id: string
  kind: "reservation" | "tryon"
  renterId: string
  listingId: string
  start: string
  end?: string
  time: string
  returnTime?: string
  place: string
  message: string
  status: "pending" | "accepted" | "declined" | "completed"
  createdAt: number
  respondedAt?: number
}

export type Transaction = {
  id: string
  date: string
  listingTitle: string
  renterName: string
  total: number
  fee: number
  earn: number
  status: "pending" | "available" | "paid"
  requestId?: string
}

export type Message = {
  id: string
  from: "me" | "them" | "system"
  text: string
  icon?: "cal" | "check" | "pin"
  image?: string
  at: number
}

export type Thread = {
  id: string
  personId: string
  listingId: string
  context: string
  role: "renting" | "lending"
  unread: boolean
  messages: Message[]
}

export type Notification = {
  id: string
  text: string
  href: string
  at: number
  read: boolean
}

export type Review = {
  id: string
  listingId: string
  author: string
  initials: string
  context: string
  rating: number
  text: string
  tags?: string[]
}

export type Account = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  bio: string
  zip: string
  radius: number
  approxLocation: boolean
  avatar?: string
  idVerified: boolean
  emailVerified?: boolean
  phoneVerified?: boolean
  payoutVerified: boolean
  sizes: { dress: string[]; tops: string[]; waist: string; suit: string; shoe: string }
  styles: string[]
  occasions: string[]
  budget: number
  notifications: { requests: boolean; reminders: boolean; messages: boolean; tips: boolean }
  card?: { last4: string }
  bankLast4?: string
  onboarded: boolean
  createdAt: string
}

export type State = {
  accounts: Account[]
  session: string | null
  people: Person[]
  listings: Listing[]
  favorites: string[]
  rentals: Rental[]
  tryOns: TryOn[]
  requests: LenderRequest[]
  transactions: Transaction[]
  threads: Thread[]
  notifications: Notification[]
  reviews: Review[]
}

/** A listing as the API returns it: owned by a user id, with photo URLs. */
export type ApiListing = Omit<Listing, "lenderId" | "booked"> & { ownerId: string }

/** What a user does with other users, as the API returns it for the signed-in user. */
export type Activity = Pick<State, "favorites" | "rentals" | "tryOns" | "requests" | "transactions" | "threads" | "notifications" | "reviews"> & {
  /** Public profiles of the people in those rentals, requests and conversations. */
  people: Person[]
  /** Dates each listing is reserved for, by listing id. */
  booked: Record<string, { start: string; end: string }[]>
}

/** Everything the app needs on load, in one request. */
export type Bootstrap = {
  account: Account | null
  listings: ApiListing[]
  people: Person[]
  activity: Activity
}
