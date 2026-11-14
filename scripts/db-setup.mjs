// Creates the tables and loads the sample lenders, listings and their photos.
// Usage: npm run db:setup   (reads DATABASE_URL from .env.local)
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).")
  process.exit(1)
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
const sql = postgres(url, { ssl: local ? false : "require", prepare: false, max: 1, onnotice: () => {} })
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

try {
  await sql.unsafe(read("../db/schema.sql"))
  console.log("✓ schema applied")

  const { people, listings, reviews } = JSON.parse(read("../db/seed-data.json"))
  for (const p of people) {
    const [first, ...rest] = p.name.split(" ")
    await sql`
      insert into users (id, first_name, last_name, zip, id_verified, is_sample, sample_rentals, sample_rating, reply_time, created_at)
      values (${p.id}, ${first}, ${rest.join(" ")}, ${p.neighborhood}, ${p.verified}, true, ${p.rentals}, ${p.rating}, ${p.replyTime}, ${`${p.memberSince}-01-15`})
      on conflict (id) do nothing`
  }
  // Earlier versions also seeded sample renters who sent automatic requests. They are gone;
  // this removes them (and anything they requested) from a database set up back then.
  await sql`delete from users where is_sample and id in ('r1', 'r2', 'r3', 'r4')`
  // Optional: give the sample listings to a real account instead of the sample lenders.
  // That account then manages them like its own closet and answers requests for them itself.
  const ownerEmail = process.env.SAMPLE_OWNER_EMAIL?.trim().toLowerCase()
  let owner = null
  if (ownerEmail) {
    const [account] = await sql`select id from users where lower(email) = ${ownerEmail} and not is_sample`
    if (account) owner = account.id
    else console.log("! SAMPLE_OWNER_EMAIL is set, but no account uses that email yet. Sign up with it, then run this again. Using the sample lenders for now.")
  }
  let added = 0
  for (const l of listings) {
    const rows = await sql`
      insert into listings (
        id, owner_id, title, category, brand, color, size, size_group, size_note, fit, description,
        occasions, styles, price_per_day, min_days, deposit, cleaning_fee, cleaning_included, try_on,
        distance_mi, rating, review_count, rentals, status, pickup_area, handoff, days, care_notes, created_at
      ) values (
        ${l.id}, ${owner ?? l.ownerId}, ${l.title}, ${l.category}, ${l.brand}, ${l.color}, ${l.size}, ${l.sizeGroup}, ${l.sizeNote}, ${l.fit}, ${l.description},
        ${sql.json(l.occasions)}, ${sql.json(l.styles)}, ${l.pricePerDay}, ${l.minDays}, ${l.deposit}, ${l.cleaningFee}, ${l.cleaningIncluded}, ${l.tryOn},
        ${l.distance}, ${l.rating}, ${l.reviewCount}, ${l.rentals}, ${l.status}, ${l.pickupArea}, ${sql.json(l.handoff)}, ${sql.json(l.days)}, ${l.careNotes},
        now() - make_interval(days => ${l.createdDaysAgo})
      )
      on conflict (id) do nothing
      returning id`
    added += rows.length
  }
  if (owner) {
    const ids = listings.map((l) => l.id)
    // The new owner can't be the renter of their own listing.
    await sql`delete from bookings where listing_id in ${sql(ids)} and renter_id = ${owner}`
    await sql`delete from threads where listing_id in ${sql(ids)} and renter_id = ${owner}`
    await sql`delete from favorites where listing_id in ${sql(ids)} and user_id = ${owner}`
    const moved = await sql`update listings set owner_id = ${owner} where id in ${sql(ids)} and owner_id <> ${owner} returning id`
    await sql`update bookings set lender_id = ${owner} where listing_id in ${sql(ids)} and lender_id <> ${owner}`
    await sql`update threads set lender_id = ${owner} where listing_id in ${sql(ids)} and lender_id <> ${owner}`
    if (moved.length) console.log(`✓ moved ${moved.length} sample listings to the SAMPLE_OWNER_EMAIL account`)
  }
  // Sample listings that are no longer in the seed file go away, with their photos and reviews.
  // Listings that real members created are never touched.
  const stale = await sql`
    delete from listings l using users u
    where u.id = l.owner_id and u.is_sample and l.id not in ${sql(listings.map((l) => l.id))}
    returning l.id`
  if (stale.length) console.log(`✓ removed ${stale.length} sample listings that are no longer in db/seed-data.json`)
  for (const r of reviews) {
    await sql`
      insert into reviews (id, listing_id, author_name, context, rating, text, created_at)
      values (${r.id}, ${r.listingId}, ${r.author}, ${r.context}, ${r.rating}, ${r.text}, now() - interval '30 days')
      on conflict (id) do update set listing_id = excluded.listing_id, author_name = excluded.author_name, context = excluded.context,
                                     rating = excluded.rating, text = excluded.text`
  }
  // Sample photos: db/sample-photos/<listing id>-<n>.jpg for the gallery (1 is the main photo)
  // and <listing id>-front|back|label|wear.jpg for the condition photos.
  // Ids are derived from the file's name and content, so re-running adds nothing new
  // and a changed image gets a new URL (photo URLs are cached as immutable).
  const photoDir = new URL("../db/sample-photos/", import.meta.url)
  const sampleIds = new Set(listings.map((l) => l.id))
  // Once a real account owns a listing its photos are theirs to change, so only fill in
  // photos for listings a sample lender owns or that have none yet, and only tidy the former.
  const fill = new Set((await sql`
    select l.id from listings l join users u on u.id = l.owner_id
    where l.id in ${sql([...sampleIds])} and (u.is_sample or not exists (select 1 from listing_photos p where p.listing_id = l.id))`).map((r) => r.id))
  const sampleOwned = (await sql`
    select l.id from listings l join users u on u.id = l.owner_id where l.id in ${sql([...sampleIds])} and u.is_sample`).map((r) => r.id)
  const keep = []
  for (const file of readdirSync(photoDir).sort()) {
    const match = /^(.+)-(\d+|front|back|label|wear)\.jpg$/.exec(file)
    if (!match || !fill.has(match[1])) continue
    const gallery = /^\d+$/.test(match[2])
    const data = readFileSync(new URL(file, photoDir))
    const h = createHash("sha1").update(`mutuari-sample:${file}:`).update(data).digest("hex")
    const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
    await sql`
      insert into listing_photos (id, listing_id, kind, position, content_type, data)
      values (${id}, ${match[1]}, ${gallery ? "gallery" : match[2]}, ${gallery ? Number(match[2]) - 1 : 0}, 'image/jpeg', ${data})
      on conflict (id) do nothing`
    keep.push(id)
  }
  const photos = keep.length
  if (photos && sampleOwned.length) await sql`delete from listing_photos where listing_id in ${sql(sampleOwned)} and id not in ${sql(keep)}`
  const [{ users, items }] = await sql`select (select count(*)::int from users) as users, (select count(*)::int from listings) as items`
  console.log(`✓ sample data loaded (${added} new listings, ${photos} sample photos checked). Database now has ${users} users and ${items} listings.`)
} catch (err) {
  console.error("✗ database setup failed:", err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
