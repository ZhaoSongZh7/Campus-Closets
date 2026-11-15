import { randomUUID } from "node:crypto"
import { z } from "zod"

import type { Account } from "@/lib/types"

import { hashPassword } from "./auth"
import { db } from "./db"
import { geoFromText } from "./geo"
import { HttpError } from "./http"

type UserRow = {
  id: string
  email: string | null
  password_hash: string | null
  first_name: string
  last_name: string
  phone: string
  bio: string
  zip: string
  radius: number
  approx_location: boolean
  avatar: string | null
  id_verified: boolean
  email_verified: boolean
  phone_verified: boolean
  payout_verified: boolean
  sizes: Account["sizes"]
  styles: string[]
  occasions: string[]
  budget: number
  notifications: Account["notifications"]
  card_last4: string | null
  bank_last4: string | null
  onboarded: boolean
  created_at: Date
}

/** The private view of a user. Never includes the password hash. */
function toAccount(u: UserRow): Account {
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email ?? "",
    phone: u.phone,
    bio: u.bio,
    zip: u.zip,
    geo: geoFromText(u.zip),
    radius: u.radius,
    approxLocation: u.approx_location,
    avatar: u.avatar ?? undefined,
    idVerified: u.id_verified,
    emailVerified: u.email_verified,
    phoneVerified: u.phone_verified,
    payoutVerified: u.payout_verified,
    sizes: u.sizes,
    styles: u.styles,
    occasions: u.occasions,
    budget: u.budget,
    notifications: u.notifications,
    card: u.card_last4 ? { last4: u.card_last4 } : undefined,
    bankLast4: u.bank_last4 ?? undefined,
    onboarded: u.onboarded,
    createdAt: u.created_at.toISOString(),
  }
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254)
const last4 = z.string().regex(/^\d{4}$/)
const tags = z.array(z.string().max(40)).max(20)

export const signUpInput = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().max(60).default(""),
  email,
  password: z.string().min(8, "Use a password with at least 8 characters.").max(200),
  zip: z.string().trim().max(60).default(""),
})

export const logInInput = z.object({ email, password: z.string().min(1).max(200) })

/** Fields a user may change about themselves. Unknown keys are rejected. */
export const accountPatch = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(60),
    email,
    phone: z.string().trim().max(30),
    bio: z.string().max(280),
    zip: z.string().trim().max(60),
    radius: z.number().int().min(1).max(100),
    approxLocation: z.boolean(),
    avatar: z
      .string()
      .max(150_000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Avatar must be an image.")
      .nullable(),
    // Verification is simulated in this MVP: the client just flips these on.
    idVerified: z.boolean(),
    emailVerified: z.boolean(),
    phoneVerified: z.boolean(),
    payoutVerified: z.boolean(),
    sizes: z.object({
      dress: tags,
      tops: tags,
      waist: z.string().max(10),
      suit: z.string().max(10),
      shoe: z.string().max(10),
    }),
    styles: tags,
    occasions: tags,
    budget: z.number().int().min(0).max(1000),
    notifications: z.object({
      requests: z.boolean(),
      reminders: z.boolean(),
      messages: z.boolean(),
      tips: z.boolean(),
    }),
    card: z.object({ last4 }).nullable(),
    bankLast4: last4.nullable(),
    onboarded: z.boolean(),
  })
  .partial()
  .strict()

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === "23505"

export async function getAccount(userId: string): Promise<Account | null> {
  const rows = await db()<UserRow[]>`select * from users where id = ${userId}`
  return rows[0] ? toAccount(rows[0]) : null
}

export async function findLogin(emailAddress: string) {
  const rows = await db()<{ id: string; email: string; password_hash: string | null }[]>`
    select id, email, password_hash from users where lower(email) = ${emailAddress}`
  return rows[0] ?? null
}

export async function createAccount(input: z.infer<typeof signUpInput>): Promise<Account> {
  const id = `u_${randomUUID()}`
  const passwordHash = await hashPassword(input.password)
  try {
    const rows = await db()<UserRow[]>`
      insert into users (id, email, password_hash, first_name, last_name, zip)
      values (${id}, ${input.email}, ${passwordHash}, ${input.firstName}, ${input.lastName}, ${input.zip})
      returning *`
    return toAccount(rows[0]!)
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "An account with this email already exists.")
    throw err
  }
}

export type GoogleProfile = { sub: string; email: string; firstName: string; lastName: string }

/**
 * Finds the user a Google account signs in as, creating one for a new email.
 *
 * An email that already belongs to a password account is not taken over: sign-up
 * never checked who owns that address, so Google proving it is not enough to hand
 * the account to whoever arrives. The caller asks for the password once instead
 * (see `connectGoogle`).
 */
export async function findOrCreateGoogleUser(profile: GoogleProfile): Promise<{ userId: string; isNew: boolean } | { needsPassword: true }> {
  const sql = db()
  const linked = await sql<{ id: string }[]>`select id from users where google_sub = ${profile.sub}`
  if (linked[0]) return { userId: linked[0].id, isNew: false }
  const sameEmail = await sql<{ id: string }[]>`select id from users where lower(email) = ${profile.email}`
  if (sameEmail[0]) return { needsPassword: true }
  const id = `u_${randomUUID()}`
  await sql`
    insert into users (id, email, google_sub, email_verified, first_name, last_name)
    values (${id}, ${profile.email}, ${profile.sub}, true, ${profile.firstName}, ${profile.lastName})`
  return { userId: id, isNew: true }
}

/** Connects a Google account to a user who has just proved they know the password. */
export async function connectGoogle(userId: string, googleSub: string) {
  try {
    await db()`update users set google_sub = ${googleSub}, email_verified = true where id = ${userId} and google_sub is null`
  } catch (err) {
    // That Google account already signs in as someone else: leave both as they are.
    if (!isUniqueViolation(err)) throw err
  }
}

export async function updateAccount(userId: string, patch: z.infer<typeof accountPatch>): Promise<Account> {
  const sql = db()
  const columns: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (value !== undefined) columns[column] = value
  }
  set("first_name", patch.firstName)
  set("last_name", patch.lastName)
  set("email", patch.email)
  set("phone", patch.phone)
  set("bio", patch.bio)
  set("zip", patch.zip)
  set("radius", patch.radius)
  set("approx_location", patch.approxLocation)
  set("avatar", patch.avatar)
  set("id_verified", patch.idVerified)
  set("email_verified", patch.emailVerified)
  set("phone_verified", patch.phoneVerified)
  set("payout_verified", patch.payoutVerified)
  set("sizes", patch.sizes && sql.json(patch.sizes))
  set("styles", patch.styles && sql.json(patch.styles))
  set("occasions", patch.occasions && sql.json(patch.occasions))
  set("budget", patch.budget)
  set("notifications", patch.notifications && sql.json(patch.notifications))
  if (patch.card !== undefined) columns.card_last4 = patch.card?.last4 ?? null
  set("bank_last4", patch.bankLast4)
  set("onboarded", patch.onboarded)
  // Changing the address means it is no longer the one that was verified.
  if (patch.email !== undefined && patch.emailVerified === undefined) {
    const current = await sql<{ email: string | null }[]>`select email from users where id = ${userId}`
    if (current[0]?.email !== patch.email) columns.email_verified = false
  }

  if (Object.keys(columns).length === 0) {
    const account = await getAccount(userId)
    if (!account) throw new HttpError(404, "Account not found.")
    return account
  }
  try {
    const rows = await sql<UserRow[]>`update users set ${sql(columns)} where id = ${userId} returning *`
    if (!rows[0]) throw new HttpError(404, "Account not found.")
    return toAccount(rows[0])
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "Another account already uses that email.")
    throw err
  }
}

export async function deleteAccount(userId: string) {
  // Sessions, listings and their photos go with the user (on delete cascade).
  await db()`delete from users where id = ${userId} and is_sample = false`
}
