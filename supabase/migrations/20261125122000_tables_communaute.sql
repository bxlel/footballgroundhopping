-- Tables des phases suivantes (comptes, check-ins, médailles, social, voyages enregistrés).
-- Elles sont créées dès maintenant, vides et verrouillées par RLS, pour que le modèle
-- de données n'ait pas à être refondu quand ces fonctionnalités arriveront.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text,
  avatar_url text,
  home_place_id bigint references public.places (geoname_id) on delete set null,
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Présence à un match, validée par la position au stade autour du coup d'envoi.
create table public.checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  venue_id bigint references public.venues (id) on delete set null,
  checked_in_at timestamptz not null default now(),
  location geography(Point, 4326),
  verified boolean not null default false,
  note text,
  unique (user_id, fixture_id)
);

create index checkins_user_idx on public.checkins (user_id, checked_in_at desc);
create index checkins_venue_idx on public.checkins (venue_id);

create table public.badges (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  description text not null default '',
  icon text,
  -- Règle d'attribution, interprétée côté serveur (ex. {"type": "venues", "count": 10}).
  rule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id bigint not null references public.badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create index follows_followed_idx on public.follows (followed_id);

-- Conseils pratiques de la communauté sur un stade, publiés après modération.
create table public.tips (
  id bigint generated always as identity primary key,
  venue_id bigint not null references public.venues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null default 'other'
    check (category in ('access', 'tickets', 'food', 'atmosphere', 'other')),
  body text not null check (char_length(body) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  created_at timestamptz not null default now()
);

create index tips_venue_idx on public.tips (venue_id) where status = 'published';

-- Voyages enregistrés (premium) : une recherche du mode Voyage, avec alertes.
create table public.trips (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  origin geography(Point, 4326) not null,
  radius_km integer not null check (radius_km between 1 and 500),
  date_from date not null,
  date_to date not null check (date_to >= date_from),
  alerts boolean not null default false,
  created_at timestamptz not null default now()
);

create index trips_user_idx on public.trips (user_id, date_from);

alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.follows enable row level security;
alter table public.tips enable row level security;
alter table public.trips enable row level security;

-- Règles de départ, volontairement strictes ; elles seront élargies avec chaque fonctionnalité.
create policy "Profils publics" on public.profiles for select to anon, authenticated using (true);
create policy "Créer son profil" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "Modifier son profil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Voir ses check-ins" on public.checkins for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Médailles publiques" on public.badges for select to anon, authenticated using (true);
create policy "Médailles obtenues publiques" on public.user_badges for select to anon, authenticated
  using (true);

create policy "Abonnements publics" on public.follows for select to anon, authenticated using (true);
create policy "Suivre" on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy "Ne plus suivre" on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

create policy "Conseils publiés ou les siens" on public.tips for select to anon, authenticated
  using (status = 'published' or user_id = (select auth.uid()));
create policy "Proposer un conseil" on public.tips for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

create policy "Ses voyages" on public.trips for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- La colonne xp et les check-ins vérifiés ne s'écrivent que côté serveur.
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, home_place_id) on public.profiles to authenticated;
