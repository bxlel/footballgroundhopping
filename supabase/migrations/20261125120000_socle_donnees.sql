-- Socle de données de Spot the Game : lieux, compétitions, stades, équipes, matchs.
-- Les coordonnées sont en geography(Point, 4326) : les distances sont en mètres, partout sur le globe.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Outils
-- ---------------------------------------------------------------------------

-- « Stade Bollaert-Delelis, Lens » -> « stade-bollaert-delelis-lens »
create or replace function public.slugify(value text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select trim(both '-' from regexp_replace(lower(unaccent(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

-- Texte de recherche : minuscules, sans accents, espaces simples.
create or replace function public.search_key(value text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select trim(regexp_replace(lower(unaccent(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Garantit un slug unique à l'insertion, puis le fige : une URL publiée ne change plus.
-- En cas de doublon : « liverpool », puis « liverpool-uruguay » (si l'argument 'country'
-- est passé et que la ligne a un pays), puis « liverpool-2 », « liverpool-3 »…
create or replace function public.set_unique_slug()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  base text := new.slug;
  candidate text := new.slug;
  suffix int := 1;
  taken boolean;
  country_slug text;
  tried_country boolean := false;
begin
  if tg_op = 'UPDATE' then
    new.slug := old.slug;
    return new;
  end if;

  if base is null or base = '' then
    base := 'sans-nom';
    candidate := base;
  end if;

  loop
    execute format('select exists (select 1 from %I.%I where slug = $1)', tg_table_schema, tg_table_name)
      into taken using candidate;
    exit when not taken;

    if not tried_country and tg_nargs > 0 and tg_argv[0] = 'country' then
      tried_country := true;
      country_slug := public.slugify(to_jsonb(new) ->> 'country');
      if country_slug <> '' then
        base := base || '-' || country_slug;
        candidate := base;
        continue;
      end if;
    end if;

    suffix := suffix + 1;
    candidate := base || '-' || suffix;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lieux (villes GeoNames) : autocomplétion du champ « Où ? », fuseaux horaires,
-- et position de secours des stades sans coordonnées.
-- ---------------------------------------------------------------------------

create table public.places (
  geoname_id bigint primary key,
  name text not null,
  -- Nom sans accents ni majuscules, pour la recherche par préfixe.
  search_name text not null,
  -- Autres noms (« londres », « munich »…) au format « ,nom1,nom2, ».
  alt_names text not null default '',
  country_code char(2) not null,
  country_name text not null default '',
  admin1 text not null default '',
  population integer not null default 0,
  timezone text,
  location geography(Point, 4326) not null
);

create index places_location_idx on public.places using gist (location);
create index places_search_name_idx on public.places using gin (search_name gin_trgm_ops);
create index places_alt_names_idx on public.places using gin (alt_names gin_trgm_ops);

-- Les noms de pays d'API-Football ne sont pas ceux de GeoNames (« England », « USA »…).
create table public.country_aliases (
  alias text primary key,
  country_code char(2) not null
);

insert into public.country_aliases (alias, country_code) values
  ('england', 'GB'), ('scotland', 'GB'), ('wales', 'GB'), ('northern ireland', 'GB'),
  ('usa', 'US'), ('south korea', 'KR'), ('north korea', 'KP'), ('ivory coast', 'CI'),
  ('czech republic', 'CZ'), ('turkey', 'TR'), ('russia', 'RU'), ('iran', 'IR'),
  ('syria', 'SY'), ('vietnam', 'VN'), ('bolivia', 'BO'), ('venezuela', 'VE'),
  ('tanzania', 'TZ'), ('moldova', 'MD'), ('macedonia', 'MK'), ('north macedonia', 'MK'),
  ('bosnia', 'BA'), ('dr congo', 'CD'), ('congo dr', 'CD'), ('cape verde', 'CV'),
  ('laos', 'LA'), ('brunei', 'BN'), ('palestine', 'PS'), ('chinese taipei', 'TW'),
  ('hong kong', 'HK'), ('macao', 'MO'), ('curacao', 'CW'), ('faroe islands', 'FO');

-- ---------------------------------------------------------------------------
-- Compétitions
-- ---------------------------------------------------------------------------

create table public.competitions (
  id bigint generated always as identity primary key,
  -- Identifiant chez le fournisseur, préfixé : « af:61 » pour API-Football.
  source_key text not null unique,
  name text not null,
  -- Null pour les compétitions internationales.
  country text,
  level text not null default 'other'
    check (level in ('top', 'lower', 'cup', 'women', 'youth', 'other')),
  -- Vrai quand le niveau a été corrigé à la main : la synchronisation n'y touche plus.
  level_locked boolean not null default false,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger competitions_touch before update on public.competitions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Stades
-- ---------------------------------------------------------------------------

create table public.venues (
  id bigint generated always as identity primary key,
  -- « af:1234 », ou « af:n:<nom-ville-pays> » quand le fournisseur ne donne pas d'identifiant.
  source_key text not null unique,
  slug text not null unique,
  name text not null,
  city text,
  country text,
  address text,
  capacity integer check (capacity is null or capacity >= 0),
  surface text,
  image_url text,
  search_name text not null default '',
  location geography(Point, 4326),
  -- D'où viennent les coordonnées, de la plus fiable à la moins fiable.
  coords_source text
    check (coords_source in ('manual', 'provider', 'wikidata', 'nominatim', 'city')),
  -- Confiance de 0 à 1 dans les coordonnées.
  coords_confidence real check (coords_confidence between 0 and 1),
  -- Dernière tentative de recherche automatique des coordonnées.
  coords_checked_at timestamptz,
  wikidata_id text,
  timezone text,
  -- Réservé aux futures infos pratiques (accès, billetterie, conseils).
  practical_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((location is null) = (coords_source is null))
);

create index venues_location_idx on public.venues using gist (location);
create index venues_search_name_idx on public.venues using gin (search_name gin_trgm_ops);

create trigger venues_slug before insert or update on public.venues
  for each row execute function public.set_unique_slug();
create trigger venues_touch before update on public.venues
  for each row execute function public.touch_updated_at();

-- Le fuseau du stade est celui de la ville connue la plus proche.
create or replace function public.set_venue_timezone()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.location is null then
    new.timezone := null;
  elsif tg_op = 'INSERT' or old.location is null or new.timezone is null
        or st_distance(new.location, old.location) > 1 then
    new.timezone := (
      select p.timezone from public.places p
      where p.timezone is not null
      order by p.location <-> new.location
      limit 1
    );
  end if;
  return new;
end;
$$;

create trigger venues_timezone before insert or update of location on public.venues
  for each row execute function public.set_venue_timezone();

-- Corrections manuelles : elles l'emportent toujours sur les sources automatiques.
create table public.venue_overrides (
  source_key text primary key,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Équipes
-- ---------------------------------------------------------------------------

create table public.teams (
  id bigint generated always as identity primary key,
  source_key text not null unique,
  slug text not null unique,
  name text not null,
  country text,
  logo_url text,
  -- Stade habituel, déduit des matchs à domicile.
  venue_id bigint references public.venues (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger teams_slug before insert or update on public.teams
  for each row execute function public.set_unique_slug('country');
create trigger teams_touch before update on public.teams
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Matchs
-- ---------------------------------------------------------------------------

create table public.fixtures (
  id bigint generated always as identity primary key,
  source_key text not null unique,
  -- « 2026-03-14-lens-lille » : figé à la création, même si le match est reporté.
  slug text not null unique,
  competition_id bigint not null references public.competitions (id),
  season integer,
  round text,
  home_team_id bigint not null references public.teams (id),
  away_team_id bigint not null references public.teams (id),
  venue_id bigint references public.venues (id) on delete set null,
  kickoff_at timestamptz not null,
  -- Faux tant que l'horaire n'est pas annoncé (seule la date est fiable).
  time_confirmed boolean not null default true,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fixtures_kickoff_idx on public.fixtures (kickoff_at);
create index fixtures_venue_idx on public.fixtures (venue_id, kickoff_at);
create index fixtures_home_idx on public.fixtures (home_team_id, kickoff_at);
create index fixtures_away_idx on public.fixtures (away_team_id, kickoff_at);

create trigger fixtures_slug before insert or update on public.fixtures
  for each row execute function public.set_unique_slug();
create trigger fixtures_touch before update on public.fixtures
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Suivi de la synchronisation
-- ---------------------------------------------------------------------------

-- Une ligne par journée de matchs synchronisée : sert à choisir les jours à rafraîchir.
create table public.sync_days (
  day date primary key,
  synced_at timestamptz not null default now(),
  fixtures_count integer not null default 0
);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  requests_used integer not null default 0,
  quota_remaining integer,
  details jsonb not null default '{}'::jsonb
);

-- Cache définitif des adresses géocodées (exigé par la politique d'usage de Nominatim).
create table public.geocode_cache (
  query_key text primary key,
  found boolean not null,
  name text,
  detail text,
  lat double precision,
  lng double precision,
  provider text not null,
  created_at timestamptz not null default now()
);
