-- DoorMan initial schema
--
-- Conventions:
--  * Transactional money amounts are integer minor units (pence): *_minor columns.
--    £20.50 is stored as 2050. Sub-penny amounts don't exist (Stripe can't charge them).
--  * Rates/percentages (commission %, discount %) are exact numeric — decimals allowed,
--    no float rounding.
--  * People are referenced by auth user id (uuid) when they have an account, with a
--    companion email column where the app lets hosts add people who haven't signed up
--    yet (guests, staff, co-hosts, promoters, transfer recipients). A signup trigger
--    links those rows to the new account by email.
--  * Enums are text + CHECK constraints (easier to evolve than Postgres enum types).

create extension if not exists citext;
create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (replaces the original app's built-in User object)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text not null default '',
  phone text,
  instagram text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  stripe_account_id text,
  stripe_onboarding_status text not null default 'none'
    check (stripe_onboarding_status in ('none', 'pending', 'restricted', 'active')),
  active_business_id uuid,  -- FK added below (business_accounts defined later)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- business_accounts
-- ---------------------------------------------------------------------------
create table public.business_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  business_email citext not null,
  business_name text not null,
  business_picture_url text,
  stripe_mode text not null default 'business' check (stripe_mode in ('personal', 'business')),
  stripe_account_id text,
  stripe_onboarding_status text not null default 'none'
    check (stripe_onboarding_status in ('none', 'pending', 'restricted', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index business_accounts_owner_idx on public.business_accounts (owner_id);
create trigger business_accounts_updated_at before update on public.business_accounts
  for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_active_business_fk
  foreign key (active_business_id) references public.business_accounts(id) on delete set null;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.business_accounts(id) on delete set null,
  title text not null,
  cover_image_url text,
  date date not null,
  start_time time not null,
  end_time time,
  venue_name text,
  address text,
  venue_lat double precision,
  venue_lng double precision,
  dress_code text,
  description text,
  entry_notes text,
  host_notes text,          -- staff-only; hidden from guests via RLS/view
  instagram text,
  is_public boolean not null default false,
  discoverable boolean not null default false,
  capacity integer,
  requests_open boolean not null default true,
  plus_one_allowed boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'cancelled', 'completed')),
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  staff_code text not null default lpad((floor(random() * 10000))::int::text, 4, '0'),
  is_paid boolean not null default false,
  currency text not null default 'gbp',
  visibility text not null default 'show_names'
    check (visibility in ('show_names', 'count_only', 'none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_host_idx on public.events (host_id);
create index events_business_idx on public.events (business_id);
create index events_discover_idx on public.events (date, status)
  where status = 'published';
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- co_hosts JSON array + parallel co_host_emails array -> one table
create table public.event_co_hosts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email citext not null,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (event_id, email)
);
create index event_co_hosts_user_idx on public.event_co_hosts (user_id);
create index event_co_hosts_email_idx on public.event_co_hosts (email);

-- ---------------------------------------------------------------------------
-- event_staff (doormen/managers; may be added by email or phone pre-signup)
-- ---------------------------------------------------------------------------
create table public.event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  email citext,
  phone text,
  name text,
  role text not null default 'doorman' check (role in ('doorman', 'manager')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (user_id is not null or email is not null or phone is not null)
);
create index event_staff_event_idx on public.event_staff (event_id);
create index event_staff_user_idx on public.event_staff (user_id);
create index event_staff_email_idx on public.event_staff (email);

-- ---------------------------------------------------------------------------
-- guestlist_entries: the core ticket/RSVP row
-- ---------------------------------------------------------------------------
create table public.guestlist_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_user_id uuid references public.profiles(id) on delete set null,
  guest_email citext not null,
  guest_name text,           -- for guests added manually who have no profile yet
  guest_phone text,
  status text not null default 'invited'
    check (status in ('invited', 'requested', 'approved', 'denied', 'waitlist', 'checked_in', 'revoked')),
  source text not null default 'manual' check (source in ('manual', 'invite_link', 'request')),
  plus_one boolean not null default false,
  plus_one_name text,
  can_chat boolean not null default false,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id),
  checked_out_at timestamptz,
  notes text,                -- host/staff notes; hidden from the guest via column grants
  qr_secret text not null default encode(gen_random_bytes(16), 'hex'),
    -- never readable by clients (column grants); QR payloads come from an RPC
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- No unique (event_id, guest_email): one email can legitimately hold several
  -- tickets (invited + purchased, or receiving a transfer while already listed).
);
create index guestlist_entries_event_idx on public.guestlist_entries (event_id);
create index guestlist_entries_event_guest_idx on public.guestlist_entries (event_id, guest_email);
create index guestlist_entries_guest_email_idx on public.guestlist_entries (guest_email);
create index guestlist_entries_guest_user_idx on public.guestlist_entries (guest_user_id);
create trigger guestlist_entries_updated_at before update on public.guestlist_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- friend_requests (both sides are registered users)
-- ---------------------------------------------------------------------------
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> receiver_id),
  unique (sender_id, receiver_id)
);
create index friend_requests_receiver_idx on public.friend_requests (receiver_id);
create trigger friend_requests_updated_at before update on public.friend_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- event_messages (event chat; sender must be a user)
-- ---------------------------------------------------------------------------
create table public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index event_messages_event_idx on public.event_messages (event_id, created_at);

-- ---------------------------------------------------------------------------
-- ticket_tiers
-- ---------------------------------------------------------------------------
create table public.ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price_minor integer not null check (price_minor >= 0),
  quantity integer not null default 0 check (quantity >= 0),
  sold integer not null default 0 check (sold >= 0),
  sales_status text not null default 'open' check (sales_status in ('open', 'sold_out', 'closed')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sold <= quantity)   -- overselling is impossible at the database level
);
create index ticket_tiers_event_idx on public.ticket_tiers (event_id);
create trigger ticket_tiers_updated_at before update on public.ticket_tiers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- promo_codes
-- ---------------------------------------------------------------------------
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,        -- stored uppercase (enforced in the manage function)
  discount_percent numeric(5, 2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  max_uses integer not null default 1 check (max_uses >= 1),
  used_count integer not null default 0 check (used_count >= 0),
  total_discount_given_minor bigint not null default 0,
  status text not null default 'active' check (status in ('active', 'exhausted', 'disabled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code),
  check (used_count <= max_uses)
);
create trigger promo_codes_updated_at before update on public.promo_codes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- promoters
-- ---------------------------------------------------------------------------
create table public.promoters (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email citext,
  commission_type text not null default 'percent' check (commission_type in ('flat', 'percent')),
  commission_percent numeric(5, 2)
    check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 100)),
  commission_flat_minor integer check (commission_flat_minor is null or commission_flat_minor >= 0),
  tracking_code text not null unique default encode(gen_random_bytes(5), 'hex'),
  status text not null default 'active' check (status in ('active', 'disabled')),
  tickets_sold integer not null default 0,
  total_sales_minor bigint not null default 0,
  commission_owed_minor bigint not null default 0,
  commission_paid_minor bigint not null default 0,
  clicks integer not null default 0,
  discount_type text not null default 'none' check (discount_type in ('none', 'percent', 'flat')),
  discount_percent numeric(5, 2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  discount_flat_minor integer not null default 0 check (discount_flat_minor >= 0),
  discount_max_uses integer not null default 0,  -- 0 = unlimited
  discount_used_count integer not null default 0,
  discount_given_minor bigint not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (commission_type <> 'percent' or commission_percent is not null),
  check (commission_type <> 'flat' or commission_flat_minor is not null)
);
create index promoters_event_idx on public.promoters (event_id);
create index promoters_email_idx on public.promoters (email);
create trigger promoters_updated_at before update on public.promoters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ticket_orders: written only by the checkout/webhook edge functions.
-- Price fields are deliberate snapshots frozen at purchase time.
-- ---------------------------------------------------------------------------
create table public.ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  tier_id uuid not null references public.ticket_tiers(id) on delete restrict,
  guest_user_id uuid references public.profiles(id) on delete set null,
  guest_email citext not null,
  guest_name text,
  promo_code_id uuid references public.promo_codes(id) on delete set null,
  promoter_id uuid references public.promoters(id) on delete set null,
  quantity integer not null default 1 check (quantity >= 1),
  unit_price_minor integer not null check (unit_price_minor >= 0),
  discount_minor integer not null default 0,
  promoter_discount_minor integer not null default 0,
  paid_minor integer not null check (paid_minor >= 0),
  platform_fee_minor integer not null default 0,
  commission_minor integer not null default 0,
  host_net_minor integer not null default 0,
  currency text not null default 'gbp',
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  guestlist_entry_id uuid references public.guestlist_entries(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'refunded', 'cancelled')),
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ticket_orders_event_idx on public.ticket_orders (event_id);
create index ticket_orders_guest_email_idx on public.ticket_orders (guest_email);
create index ticket_orders_guest_user_idx on public.ticket_orders (guest_user_id);
create trigger ticket_orders_updated_at before update on public.ticket_orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ticket_transfers (recipient may not have an account yet)
-- ---------------------------------------------------------------------------
create table public.ticket_transfers (
  id uuid primary key default gen_random_uuid(),
  guestlist_entry_id uuid not null references public.guestlist_entries(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email citext not null,
  recipient_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ticket_transfers_entry_idx on public.ticket_transfers (guestlist_entry_id);
create index ticket_transfers_recipient_idx on public.ticket_transfers (recipient_email);
create trigger ticket_transfers_updated_at before update on public.ticket_transfers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payouts (written only by service role / Stripe flows)
-- ---------------------------------------------------------------------------
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('host', 'promoter')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'gbp',
  stripe_transfer_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payouts_user_idx on public.payouts (user_id);
create trigger payouts_updated_at before update on public.payouts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Signup: create the profile and link any rows that referenced this email
-- before the account existed (invited guests, staff, co-hosts, promoters,
-- pending transfers, past orders).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
security definer set search_path = public
language plpgsql as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  update public.guestlist_entries set guest_user_id = new.id
    where guest_user_id is null and guest_email = new.email;
  update public.event_co_hosts set user_id = new.id
    where user_id is null and email = new.email;
  update public.event_staff set user_id = new.id
    where user_id is null and email = new.email;
  update public.promoters set user_id = new.id
    where user_id is null and email = new.email;
  update public.ticket_orders set guest_user_id = new.id
    where guest_user_id is null and guest_email = new.email;
  update public.ticket_transfers set recipient_id = new.id
    where recipient_id is null and recipient_email = new.email;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
