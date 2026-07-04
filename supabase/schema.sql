-- =============================================================
-- Kisan Alert — Full Schema + RLS
-- Run this once in Supabase SQL Editor
-- =============================================================

-- -------------------------
-- 1. TABLES
-- -------------------------

create table if not exists districts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  state        text not null,
  latitude     float,
  longitude    float
);

create table if not exists users (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text,
  role         text not null default 'farmer' check (role in ('farmer', 'expert')),
  district_id  uuid references districts(id) on delete set null,
  soil_type    text,
  created_at   timestamptz not null default now()
);

create table if not exists recommendations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  crop_name        text,
  reasoning        text,
  confidence_score float,
  created_at       timestamptz not null default now()
);

create table if not exists disease_checks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  image_url        text,
  diagnosis        text,
  confidence_score float,
  treatment_advice text,
  created_at       timestamptz not null default now()
);

create table if not exists cases (
  id               uuid primary key default gen_random_uuid(),
  disease_check_id uuid not null references disease_checks(id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending', 'resolved')),
  expert_notes     text,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);


-- -------------------------
-- 2. ROW LEVEL SECURITY
-- -------------------------

alter table districts       enable row level security;
alter table users           enable row level security;
alter table recommendations enable row level security;
alter table disease_checks  enable row level security;
alter table cases           enable row level security;


-- -------------------------
-- 3. RLS POLICIES
-- -------------------------

-- districts: readable by anyone (lookup table)
create policy "districts: public read"
  on districts for select
  to anon, authenticated
  using (true);


-- users: own row only
create policy "users: select own"
  on users for select
  to authenticated
  using (id = auth.uid());

create policy "users: insert own"
  on users for insert
  to authenticated
  with check (id = auth.uid());

create policy "users: update own"
  on users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- recommendations: own rows only
create policy "recommendations: select own"
  on recommendations for select
  to authenticated
  using (user_id = auth.uid());

create policy "recommendations: insert own"
  on recommendations for insert
  to authenticated
  with check (user_id = auth.uid());


-- disease_checks: own rows only
create policy "disease_checks: select own"
  on disease_checks for select
  to authenticated
  using (user_id = auth.uid());

create policy "disease_checks: insert own"
  on disease_checks for insert
  to authenticated
  with check (user_id = auth.uid());


-- cases: experts can select + update all rows
--        (role check done via subquery on users table)
create policy "cases: expert select all"
  on cases for select
  to authenticated
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'expert'
    )
  );

create policy "cases: expert update all"
  on cases for update
  to authenticated
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'expert'
    )
  );

-- farmers can insert a case tied to their own disease_check
create policy "cases: farmer insert own"
  on cases for insert
  to authenticated
  with check (
    exists (
      select 1 from disease_checks
      where disease_checks.id = cases.disease_check_id
        and disease_checks.user_id = auth.uid()
    )
  );

-- =============================================================
-- Done. Zero errors, no RLS warnings.
-- =============================================================