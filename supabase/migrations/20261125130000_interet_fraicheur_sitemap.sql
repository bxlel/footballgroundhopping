-- « J'y vais » sans compte, fraîcheur des données, sitemap, et délais d'exécution des recherches.

-- ---------------------------------------------------------------------------
-- « J'y vais » : un signal social dès maintenant, sans compte
-- ---------------------------------------------------------------------------

-- Un appareil = un identifiant aléatoire créé par le navigateur au premier clic.
-- Quand les comptes arriveront, `user_id` rattachera ces lignes à leur propriétaire.
create table public.fixture_interest (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  device_id uuid not null,
  user_id uuid references public.profiles (id) on delete set null,
  -- Empreinte de l'adresse IP (jamais l'adresse elle-même) : sert seulement à limiter les abus.
  ip_hash text,
  created_at timestamptz not null default now(),
  primary key (fixture_id, device_id)
);

create index fixture_interest_device_idx on public.fixture_interest (device_id);
create index fixture_interest_ip_idx on public.fixture_interest (ip_hash, created_at);

-- Aucune lecture ni écriture directe : tout passe par les fonctions ci-dessous.
alter table public.fixture_interest enable row level security;
revoke all on public.fixture_interest from anon, authenticated;

-- Compteur tenu à jour par la fonction : pas de comptage à chaque affichage.
alter table public.fixtures
  add column going_count integer not null default 0 check (going_count >= 0);

-- Marque ou retire « J'y vais » pour un appareil, et rend l'état et le compteur à jour.
-- Garde-fous : match à venir uniquement, 40 matchs par appareil, 60 ajouts par jour et par adresse IP.
create or replace function public.set_going(p_fixture_slug text, p_device_id uuid, p_going boolean)
returns table (going boolean, going_count integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_fixture public.fixtures%rowtype;
  v_ip_hash text;
  v_changed integer;
begin
  if p_device_id is null then
    raise exception 'Appareil manquant' using errcode = '22023';
  end if;

  select * into v_fixture from public.fixtures f where f.slug = p_fixture_slug for update;
  if not found then
    raise exception 'Match introuvable' using errcode = 'P0002';
  end if;

  if p_going then
    if v_fixture.status in ('finished', 'cancelled') or v_fixture.kickoff_at < now() - interval '3 hours' then
      raise exception 'Ce match est passé' using errcode = '22023';
    end if;

    v_ip_hash := md5(coalesce(
      nullif(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1), ''),
      'inconnue'
    ));

    if (select count(*) from public.fixture_interest i
        join public.fixtures f on f.id = i.fixture_id
        where i.device_id = p_device_id and f.kickoff_at >= now() - interval '3 hours') >= 40 then
      raise exception 'Trop de matchs suivis' using errcode = '54000';
    end if;
    if v_ip_hash <> md5('inconnue')
       and (select count(*) from public.fixture_interest i
            where i.ip_hash = v_ip_hash and i.created_at > now() - interval '1 day') >= 60 then
      raise exception 'Trop de demandes' using errcode = '54000';
    end if;

    insert into public.fixture_interest (fixture_id, device_id, ip_hash)
    values (v_fixture.id, p_device_id, v_ip_hash)
    on conflict do nothing;
  else
    delete from public.fixture_interest i
    where i.fixture_id = v_fixture.id and i.device_id = p_device_id;
  end if;
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    update public.fixtures f
    set going_count = (select count(*) from public.fixture_interest i where i.fixture_id = f.id)
    where f.id = v_fixture.id
    returning f.going_count into v_fixture.going_count;
  end if;

  return query select p_going, v_fixture.going_count;
end;
$$;

-- Parmi ces matchs, ceux que cet appareil a marqués « J'y vais ».
create or replace function public.my_going(p_device_id uuid, p_fixture_slugs text[])
returns setof text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select f.slug
  from public.fixture_interest i
  join public.fixtures f on f.id = i.fixture_id
  where i.device_id = p_device_id
    and f.slug = any (p_fixture_slugs[1:200]);
$$;

-- Le compteur ne doit pas faire bouger `updated_at` du match (qui sert de date de mise à jour au sitemap).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'fixtures'
     and to_jsonb(new) - 'going_count' - 'updated_at' = to_jsonb(old) - 'going_count' - 'updated_at' then
    return new;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Le compteur dans les lectures
-- ---------------------------------------------------------------------------

create or replace view public.fixture_cards
with (security_invoker = true) as
select
  f.id,
  f.slug,
  f.kickoff_at,
  f.time_confirmed,
  f.status,
  c.name as competition_name,
  c.country as competition_country,
  c.level as competition_level,
  f.home_team_id,
  h.name as home_name,
  h.slug as home_slug,
  h.logo_url as home_logo_url,
  f.away_team_id,
  a.name as away_name,
  a.slug as away_slug,
  a.logo_url as away_logo_url,
  f.venue_id,
  v.name as venue_name,
  v.slug as venue_slug,
  v.city as venue_city,
  v.country as venue_country,
  st_y(v.location::geometry) as venue_lat,
  st_x(v.location::geometry) as venue_lng,
  v.timezone as venue_timezone,
  coalesce(v.coords_source = 'city', false) as venue_approximate,
  f.going_count
from public.fixtures f
join public.competitions c on c.id = f.competition_id
join public.teams h on h.id = f.home_team_id
join public.teams a on a.id = f.away_team_id
left join public.venues v on v.id = f.venue_id;

-- Le type de retour change : la fonction doit être recréée.
drop function public.search_fixtures(double precision, double precision, double precision, date, date, text[], text[], integer);

create function public.search_fixtures(
  origin_lat double precision,
  origin_lng double precision,
  radius_km double precision,
  date_from date,
  date_to date,
  levels text[] default null,
  countries text[] default null,
  max_results integer default 400
)
returns table (
  id bigint,
  slug text,
  kickoff_at timestamptz,
  time_confirmed boolean,
  status text,
  competition_name text,
  competition_country text,
  competition_level text,
  home_name text,
  home_slug text,
  home_logo_url text,
  away_name text,
  away_slug text,
  away_logo_url text,
  venue_name text,
  venue_slug text,
  venue_city text,
  venue_country text,
  venue_lat double precision,
  venue_lng double precision,
  venue_timezone text,
  venue_approximate boolean,
  going_count integer,
  distance_km double precision
)
language sql
stable
set search_path = public, extensions
-- Une recherche ne doit jamais monopoliser la base.
set statement_timeout = '8s'
as $$
  with params as (
    select
      st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography as origin,
      least(greatest(radius_km, 1), 500) * 1000 as radius_m,
      date_from as d1,
      least(greatest(date_to, date_from), date_from + 31) as d2
  ),
  nearby as (
    select v.id, st_distance(v.location, p.origin) / 1000 as distance_km
    from public.venues v, params p
    where v.location is not null
      and st_dwithin(v.location, p.origin, p.radius_m)
  )
  select
    fc.id, fc.slug, fc.kickoff_at, fc.time_confirmed, fc.status,
    fc.competition_name, fc.competition_country, fc.competition_level,
    fc.home_name, fc.home_slug, fc.home_logo_url,
    fc.away_name, fc.away_slug, fc.away_logo_url,
    fc.venue_name, fc.venue_slug, fc.venue_city, fc.venue_country,
    fc.venue_lat, fc.venue_lng, fc.venue_timezone, fc.venue_approximate,
    fc.going_count,
    n.distance_km
  from public.fixture_cards fc
  join nearby n on n.id = fc.venue_id
  cross join params p
  where fc.status in ('scheduled', 'live')
    and fc.kickoff_at >= (p.d1 - 1)::timestamp at time zone 'UTC'
    and fc.kickoff_at < (p.d2 + 2)::timestamp at time zone 'UTC'
    and (fc.kickoff_at at time zone coalesce(fc.venue_timezone, 'UTC'))::date between p.d1 and p.d2
    and (levels is null or fc.competition_level = any (levels))
    and (countries is null or fc.competition_country = any (countries))
  order by
    (fc.kickoff_at at time zone coalesce(fc.venue_timezone, 'UTC'))::date,
    n.distance_km,
    fc.kickoff_at,
    fc.id
  limit least(greatest(max_results, 1), 1000);
$$;

alter function public.search_places(text, integer) set statement_timeout = '4s';

-- ---------------------------------------------------------------------------
-- Fraîcheur des données
-- ---------------------------------------------------------------------------

-- Date de la dernière synchronisation réussie des matchs : le site prévient quand elle est ancienne,
-- et la fonction `health` s'en sert pour la surveillance.
create or replace function public.data_status()
returns table (fixtures_synced_at timestamptz, upcoming_fixtures bigint)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    (select max(r.finished_at) from public.sync_runs r where r.kind = 'fixtures' and r.ok),
    (select count(*) from public.fixtures f
      where f.kickoff_at >= now() and f.status in ('scheduled', 'live'));
$$;

-- ---------------------------------------------------------------------------
-- Sitemap
-- ---------------------------------------------------------------------------

-- Pages à faire connaître aux moteurs de recherche : les matchs à venir, et les stades
-- et clubs qui ont un match à venir. Sans cela, rien ne mène à ces pages.
create or replace function public.sitemap_entries(max_results integer default 20000)
returns table (kind text, slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, extensions
set statement_timeout = '8s'
as $$
  with upcoming as (
    select f.slug, f.updated_at, f.venue_id, f.home_team_id, f.away_team_id, f.kickoff_at
    from public.fixtures f
    where f.kickoff_at >= now() - interval '1 day'
      and f.status in ('scheduled', 'live', 'postponed')
  ),
  entries as (
    select 'venue'::text as kind, v.slug, v.updated_at, 0 as rank, min(u.kickoff_at) as soonest
    from upcoming u join public.venues v on v.id = u.venue_id
    group by v.slug, v.updated_at
    union all
    select 'match', u.slug, u.updated_at, 1, u.kickoff_at from upcoming u
    union all
    select 'team', t.slug, t.updated_at, 2, min(u.kickoff_at)
    from upcoming u join public.teams t on t.id in (u.home_team_id, u.away_team_id)
    group by t.slug, t.updated_at
  )
  select e.kind, e.slug, e.updated_at
  from entries e
  order by e.rank, e.soonest
  limit least(greatest(max_results, 1), 45000);
$$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------

grant select on public.fixture_cards to anon, authenticated;

revoke all on function
  public.set_going(text, uuid, boolean),
  public.my_going(uuid, text[]),
  public.data_status(),
  public.sitemap_entries(integer)
from public;

grant execute on function
  public.search_fixtures(double precision, double precision, double precision, date, date, text[], text[], integer),
  public.set_going(text, uuid, boolean),
  public.my_going(uuid, text[]),
  public.data_status(),
  public.sitemap_entries(integer)
to anon, authenticated, service_role;
