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
  let added = 0
  for (const l of listings) {
    const rows = await sql`
      insert into listings (
        id, owner_id, title, category, brand, color, size, size_group, size_note, fit, description,
        occasions, styles, price_per_day, min_days, deposit, cleaning_fee, cleaning_included, try_on,
        distance_mi, rating, review_count, rentals, status, pickup_area, handoff, days, care_notes, created_at
      ) values (
        ${l.id}, ${l.ownerId}, ${l.title}, ${l.category}, ${l.brand}, ${l.color}, ${l.size}, ${l.sizeGroup}, ${l.sizeNote}, ${l.fit}, ${l.description},
        ${sql.json(l.occasions)}, ${sql.json(l.styles)}, ${l.pricePerDay}, ${l.minDays}, ${l.deposit}, ${l.cleaningFee}, ${l.cleaningIncluded}, ${l.tryOn},
        ${l.distance}, ${l.rating}, ${l.reviewCount}, ${l.rentals}, ${l.status}, ${l.pickupArea}, ${sql.json(l.handoff)}, ${sql.json(l.days)}, ${l.careNotes},
        now() - make_interval(days => ${l.createdDaysAgo})
      )
      on conflict (id) do nothing
      returning id`
    added += rows.length
  }
  for (const r of reviews) {
    await sql`
      insert into reviews (id, listing_id, author_id, author_name, context, rating, text, created_at)
      values (${r.id}, ${r.listingId}, ${r.authorId}, ${r.author}, ${r.context}, ${r.rating}, ${r.text}, now() - interval '30 days')
      on conflict (id) do nothing`
  }
  // Sample photos: db/sample-photos/<listing id>-<n>.jpg for the gallery (1 is the main photo)
  // and <listing id>-front|back|label|wear.jpg for the condition photos.
  // Ids are derived from the file's name and content, so re-running adds nothing new
  // and a changed image gets a new URL (photo URLs are cached as immutable).
  const photoDir = new URL("../db/sample-photos/", import.meta.url)
  const sampleIds = new Set(listings.map((l) => l.id))
  const keep = []
  for (const file of readdirSync(photoDir).sort()) {
    const match = /^(.+)-(\d+|front|back|label|wear)\.jpg$/.exec(file)
    if (!match || !sampleIds.has(match[1])) continue
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
  if (photos) await sql`delete from listing_photos where listing_id in ${sql([...sampleIds])} and id not in ${sql(keep)}`
  const [{ users, items }] = await sql`select (select count(*)::int from users) as users, (select count(*)::int from listings) as items`
  console.log(`✓ sample data loaded (${added} new listings, ${photos} sample photos). Database now has ${users} users and ${items} listings.`)
} catch (err) {
  console.error("✗ database setup failed:", err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
