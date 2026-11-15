-- Campus Closet schema. Safe to run repeatedly (`npm run db:setup`).

create table if not exists users (
  id              text primary key,
  email           text,                         -- null for the built-in sample lenders
  password_hash   text,                         -- null means "cannot log in"
  first_name      text not null,
  last_name       text not null default '',
  phone           text not null default '',
  bio             text not null default '',
  zip             text not null default '',
  radius          integer not null default 5,
  approx_location boolean not null default true,
  avatar          text,                         -- small data URL
  id_verified     boolean not null default false,
  email_verified  boolean not null default false,
  phone_verified  boolean not null default false,
  payout_verified boolean not null default false,
  sizes           jsonb not null default '{"dress":[],"tops":[],"waist":"","suit":"","shoe":""}',
  styles          jsonb not null default '[]',
  occasions       jsonb not null default '[]',
  budget          integer not null default 60,
  notifications   jsonb not null default '{"requests":true,"reminders":true,"messages":true,"tips":false}',
  card_last4      text,
  bank_last4      text,
  onboarded       boolean not null default false,
  -- Sample lenders only: stats that real users will earn from real rentals later.
  is_sample       boolean not null default false,
  sample_rentals  integer not null default 0,
  sample_rating   numeric(2,1) not null default 0,
  reply_time      text not null default '',
  created_at      timestamptz not null default now()
);
create unique index if not exists users_email_key on users (lower(email));
-- Google's permanent id for the account that signs in as this user. Null until Google is connected.
alter table users add column if not exists google_sub text;
create unique index if not exists users_google_sub_key on users (google_sub);

create table if not exists sessions (
  token_hash  text primary key,                 -- sha256 of the cookie value
  user_id     text not null references users (id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on sessions (user_id);

create table if not exists listings (
  id                text primary key,
  owner_id          text not null references users (id) on delete cascade,
  title             text not null,
  category          text not null default '',
  brand             text not null default '',
  color             text not null default '',
  size              text not null default '',
  size_group        text not null default '',
  size_note         text not null default '',
  fit               text not null default '',
  description       text not null default '',
  occasions         jsonb not null default '[]',
  styles            jsonb not null default '[]',
  price_per_day     numeric(8,2) not null default 0,
  min_days          integer not null default 1,
  deposit           numeric(8,2) not null default 0,
  cleaning_fee      numeric(8,2) not null default 0,
  cleaning_included boolean not null default true,
  try_on            boolean not null default true,
  distance_mi       numeric(5,1),               -- no longer read: distance is worked out from places (src/server/geo.ts)
  rating            numeric(2,1) not null default 0,
  review_count      integer not null default 0,
  rentals           integer not null default 0,
  status            text not null default 'draft' check (status in ('listed', 'paused', 'draft')),
  pickup_area       text not null default '',
  handoff           jsonb not null default '[]',
  days              jsonb not null default '[]',
  care_notes        text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists listings_owner_id_idx on listings (owner_id);
create index if not exists listings_status_idx on listings (status);

create table if not exists listing_photos (
  id            text primary key,
  listing_id    text not null references listings (id) on delete cascade,
  kind          text not null check (kind in ('gallery', 'front', 'back', 'label', 'wear')),
  position      integer not null default 0,
  content_type  text not null,
  data          bytea not null,
  created_at    timestamptz not null default now()
);
create index if not exists listing_photos_listing_id_idx on listing_photos (listing_id);

-- ---------------------------------------------------------------------------
-- Activity between users: saved outfits, requests and rentals, messages,
-- notifications and reviews.
-- ---------------------------------------------------------------------------

create table if not exists favorites (
  user_id     text not null references users (id) on delete cascade,
  listing_id  text not null references listings (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- One row per try-on or reservation; the renter and the lender see the same row.
--   reservation: requested → confirmed → active → returned → completed
--   try-on:      requested → confirmed → completed
--   either can end early as cancelled (by the renter) or declined (by the lender).
-- Dates are stored as YYYY-MM-DD text: they are calendar days, not moments in time.
create table if not exists bookings (
  id                text primary key,
  kind              text not null check (kind in ('reservation', 'tryon')),
  listing_id        text not null references listings (id) on delete cascade,
  renter_id         text not null references users (id) on delete cascade,
  lender_id         text not null references users (id) on delete cascade,
  status            text not null default 'requested'
                    check (status in ('requested', 'confirmed', 'active', 'returned', 'completed', 'cancelled', 'declined')),
  start_date        text not null check (start_date ~ '^\d{4}-\d{2}-\d{2}$'),
  end_date          text check (end_date ~ '^\d{4}-\d{2}-\d{2}$'),
  event_date        text check (event_date ~ '^\d{4}-\d{2}-\d{2}$'),
  pickup_time       text not null default '',
  return_time       text not null default '',
  place             text not null default 'public' check (place in ('public', 'home', 'other')),
  note              text not null default '',
  code              text not null default '',
  handoff_code      text not null default '',
  days              integer not null default 0,
  subtotal          numeric(10,2) not null default 0,
  cleaning_fee      numeric(10,2) not null default 0,
  service_fee       numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  deposit           numeric(10,2) not null default 0,
  tried_on          text,
  pickup_checklist  jsonb not null default '[false,false,false]',
  return_checklist  jsonb not null default '[false,false,false]',
  reviewed          boolean not null default false,
  -- Lender's earnings for a reservation: pending until the outfit is back, then available, then paid.
  payout            text check (payout in ('pending', 'available', 'paid')),
  created_at        timestamptz not null default now(),
  responded_at      timestamptz,
  returned_at       timestamptz
);
create index if not exists bookings_renter_id_idx on bookings (renter_id);
create index if not exists bookings_lender_id_idx on bookings (lender_id);
create index if not exists bookings_listing_id_idx on bookings (listing_id);

-- A conversation between a renter and a listing's owner about that listing.
create table if not exists threads (
  id              text primary key,
  listing_id      text not null references listings (id) on delete cascade,
  renter_id       text not null references users (id) on delete cascade,
  lender_id       text not null references users (id) on delete cascade,
  context         text not null default '',
  created_by      text references users (id) on delete set null,
  renter_read_at  timestamptz not null default now(),
  lender_read_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (listing_id, renter_id)
);
create index if not exists threads_renter_id_idx on threads (renter_id);
create index if not exists threads_lender_id_idx on threads (lender_id);

-- Photos attached to a message or taken at pickup / return. Only the two people involved can load them.
create table if not exists uploads (
  id            text primary key,
  uploader_id   text not null references users (id) on delete cascade,
  thread_id     text references threads (id) on delete cascade,
  booking_id    text references bookings (id) on delete cascade,
  phase         text check (phase in ('pickup', 'return')),
  slot          text check (slot in ('front', 'back', 'label', 'wear')),
  content_type  text not null,
  data          bytea not null,
  created_at    timestamptz not null default now(),
  unique (booking_id, phase, slot)
);

-- System messages (is_system) describe an event; "{actor}" in their text is the sender,
-- shown as "You" to that person and by first name to the other.
create table if not exists messages (
  id          text primary key,
  thread_id   text not null references threads (id) on delete cascade,
  sender_id   text references users (id) on delete set null,
  is_system   boolean not null default false,
  icon        text check (icon in ('cal', 'check', 'pin')),
  text        text not null default '',
  upload_id   text references uploads (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Messages written in one transaction share a timestamp; seq keeps them in the order they were written.
  seq         bigint generated always as identity
);
alter table messages add column if not exists seq bigint generated always as identity;
create index if not exists messages_thread_id_idx on messages (thread_id, created_at);

create table if not exists notifications (
  id          text primary key,
  user_id     text not null references users (id) on delete cascade,
  text        text not null,
  href        text not null default '',
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_id_idx on notifications (user_id, created_at desc);

create table if not exists reviews (
  id             text primary key,
  listing_id     text not null references listings (id) on delete cascade,
  booking_id     text unique references bookings (id) on delete set null,
  author_id      text references users (id) on delete set null,
  author_name    text not null,
  context        text not null default '',
  rating         integer not null check (rating between 1 and 5),
  lender_rating  integer check (lender_rating between 1 and 5),
  text           text not null default '',
  tags           jsonb not null default '[]',
  created_at     timestamptz not null default now()
);
create index if not exists reviews_listing_id_idx on reviews (listing_id);

-- Only this app's server (the table owner) may touch these tables.
-- Hosts such as Supabase also expose the public schema through an auto-generated
-- REST API whose key is public. Row-level security with no policies shuts that
-- door; the owner role the app connects as is not subject to it.
alter table users          enable row level security;
alter table sessions       enable row level security;
alter table listings       enable row level security;
alter table listing_photos enable row level security;
alter table favorites      enable row level security;
alter table bookings       enable row level security;
alter table threads        enable row level security;
alter table uploads        enable row level security;
alter table messages       enable row level security;
alter table notifications  enable row level security;
alter table reviews        enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table users, sessions, listings, listing_photos, favorites, bookings, threads, uploads, messages, notifications, reviews from %I', r);
    end if;
  end loop;
end $$;
