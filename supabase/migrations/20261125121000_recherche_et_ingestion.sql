-- Lecture publique (vues et fonctions de recherche) et écriture réservée au serveur
-- (ingestion des matchs, coordonnées des stades).

-- ---------------------------------------------------------------------------
-- Vues de lecture
-- ---------------------------------------------------------------------------

-- Un match « prêt à afficher » : tout ce qu'il faut pour une carte de match ou sa page.
create view public.fixture_cards
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
  coalesce(v.coords_source = 'city', false) as venue_approximate
from public.fixtures f
join public.competitions c on c.id = f.competition_id
join public.teams h on h.id = f.home_team_id
join public.teams a on a.id = f.away_team_id
left join public.venues v on v.id = f.venue_id;

create view public.venue_pages
with (security_invoker = true) as
select
  v.id,
  v.slug,
  v.name,
  v.city,
  v.country,
  v.address,
  v.capacity,
  v.surface,
  st_y(v.location::geometry) as lat,
  st_x(v.location::geometry) as lng,
  v.timezone,
  coalesce(v.coords_source = 'city', false) as approximate,
  v.practical_info
from public.venues v;

create view public.team_pages
with (security_invoker = true) as
select
  t.id,
  t.slug,
  t.name,
  t.country,
  t.logo_url,
  v.name as venue_name,
  v.slug as venue_slug,
  v.city as venue_city
from public.teams t
left join public.venues v on v.id = t.venue_id;

-- ---------------------------------------------------------------------------
-- Recherche du mode Voyage
-- ---------------------------------------------------------------------------

-- Matchs à voir dans un rayon autour d'un point, sur une période.
-- Les dates sont des dates locales au stade : chercher « samedi » à Tokyo depuis Paris
-- renvoie bien les matchs du samedi, heure de Tokyo.
create or replace function public.search_fixtures(
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
  distance_km double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with params as (
    select
      st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography as origin,
      -- Garde-fous : 500 km et 31 jours au plus, quoi que demande l'appelant.
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
    n.distance_km
  from public.fixture_cards fc
  join nearby n on n.id = fc.venue_id
  cross join params p
  where fc.status in ('scheduled', 'live')
    -- Fenêtre large sur l'index, puis date locale exacte.
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

-- Suggestions du champ « Où ? » : villes (par population) puis stades.
create or replace function public.search_places(q text, max_results integer default 8)
returns table (
  kind text,
  name text,
  detail text,
  lat double precision,
  lng double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with needle as (
    select
      public.search_key(q) as raw,
      replace(replace(replace(public.search_key(q), '\', '\\'), '%', '\%'), '_', '\_') as pattern,
      least(greatest(max_results, 1), 20) as lim
  ),
  cities as (
    select
      'city'::text as kind,
      p.name,
      concat_ws(', ', nullif(p.admin1, ''), nullif(p.country_name, '')) as detail,
      st_y(p.location::geometry) as lat,
      st_x(p.location::geometry) as lng,
      case when p.search_name like n.pattern || '%' then 0 else 1 end as rank,
      p.population
    from public.places p, needle n
    where length(n.raw) >= 2
      and (p.search_name like n.pattern || '%' or p.alt_names like '%,' || n.pattern || '%')
    order by rank, p.population desc
    limit (select lim from needle)
  ),
  stadiums as (
    select
      'venue'::text as kind,
      v.name,
      concat_ws(', ', v.city, v.country) as detail,
      st_y(v.location::geometry) as lat,
      st_x(v.location::geometry) as lng
    from public.venues v, needle n
    where length(n.raw) >= 3
      and v.location is not null
      and v.coords_source <> 'city'
      and v.search_name like '%' || n.pattern || '%'
    order by v.capacity desc nulls last, v.name
    limit 4
  ),
  merged as (
    select kind, name, detail, lat, lng, 0 as grp, row_number() over (order by rank, population desc) as pos
    from cities
    union all
    select kind, name, detail, lat, lng, 1 as grp, row_number() over () as pos
    from stadiums
  )
  select kind, name, detail, lat, lng
  from merged
  order by grp, pos
  limit (select lim from needle);
$$;

-- ---------------------------------------------------------------------------
-- Coordonnées des stades (réservé au serveur)
-- ---------------------------------------------------------------------------

-- Ville GeoNames correspondant à un couple (ville, pays) du fournisseur de matchs.
create or replace function public.guess_city(city text, country text)
returns table (geoname_id bigint, lat double precision, lng double precision, country_matched boolean)
language sql
stable
set search_path = public, extensions
as $$
  with keys as (
    select public.search_key(split_part(city, ',', 1)) as city_key, public.search_key(country) as country_key
  ),
  code as (
    select coalesce(
      (select a.country_code from public.country_aliases a, keys k where a.alias = k.country_key),
      (select p.country_code from public.places p, keys k
        where public.search_key(p.country_name) = k.country_key limit 1)
    ) as country_code
  )
  select
    p.geoname_id,
    st_y(p.location::geometry),
    st_x(p.location::geometry),
    (p.country_code = c.country_code) as country_matched
  from public.places p, keys k, code c
  where k.city_key <> ''
    and (p.search_name = k.city_key or p.alt_names like '%,' || k.city_key || ',%')
    and (c.country_code is null or p.country_code = c.country_code)
  order by (p.search_name = k.city_key) desc, p.population desc
  limit 1;
$$;

-- Enregistre des coordonnées pour un stade. Une correction manuelle n'est jamais écrasée,
-- et une source moins fiable ne remplace pas une source plus fiable.
create or replace function public.set_venue_coords(
  p_venue_id bigint,
  p_lat double precision,
  p_lng double precision,
  p_source text,
  p_confidence real,
  p_wikidata_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ranks constant text[] := array['city', 'nominatim', 'wikidata', 'provider', 'manual'];
  current_source text;
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    raise exception 'Coordonnées invalides : %, %', p_lat, p_lng;
  end if;

  select coords_source into current_source from public.venues where id = p_venue_id for update;
  if not found then
    return false;
  end if;

  if current_source is not null
     and array_position(ranks, current_source) > array_position(ranks, p_source) then
    update public.venues set coords_checked_at = now() where id = p_venue_id;
    return false;
  end if;

  update public.venues
  set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      coords_source = p_source,
      coords_confidence = p_confidence,
      wikidata_id = coalesce(p_wikidata_id, wikidata_id),
      coords_checked_at = now()
  where id = p_venue_id;
  return true;
end;
$$;

-- Applique les corrections manuelles aux stades concernés.
create or replace function public.apply_venue_overrides()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  changed integer;
begin
  update public.venues v
  set location = st_setsrid(st_makepoint(o.lng, o.lat), 4326)::geography,
      coords_source = 'manual',
      coords_confidence = 1,
      coords_checked_at = now()
  from public.venue_overrides o
  where o.source_key = v.source_key
    and (v.location is null
      or v.coords_source <> 'manual'
      or st_distance(v.location, st_setsrid(st_makepoint(o.lng, o.lat), 4326)::geography) > 1);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.venue_override_changed()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.apply_venue_overrides();
  return null;
end;
$$;

create trigger venue_overrides_apply after insert or update on public.venue_overrides
  for each statement execute function public.venue_override_changed();

-- Position de secours : le centre de la ville, signalé comme approximatif.
-- Mieux vaut un match situé à 3 km près qu'un match invisible dans la recherche.
create or replace function public.apply_city_fallback()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  changed integer;
begin
  update public.venues v
  set location = st_setsrid(st_makepoint(g.lng, g.lat), 4326)::geography,
      coords_source = 'city',
      coords_confidence = 0.3
  from (
    select v2.id, c.lat, c.lng
    from public.venues v2
    cross join lateral public.guess_city(v2.city, v2.country) c
    where v2.location is null and v2.city is not null and c.country_matched
  ) g
  where g.id = v.id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Stades dont il faut encore chercher les coordonnées précises, les plus demandés d'abord.
create or replace function public.venues_to_locate(max_results integer default 20)
returns table (
  id bigint,
  source_key text,
  name text,
  city text,
  country text,
  city_lat double precision,
  city_lng double precision,
  upcoming integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    v.id, v.source_key, v.name, v.city, v.country,
    c.lat as city_lat, c.lng as city_lng,
    (select count(*)::integer from public.fixtures f
      where f.venue_id = v.id and f.kickoff_at >= now()) as upcoming
  from public.venues v
  left join lateral (
    select g.lat, g.lng from public.guess_city(v.city, v.country) g where g.country_matched
  ) c on true
  where (v.location is null or v.coords_source = 'city')
    and (v.coords_checked_at is null or v.coords_checked_at < now() - interval '30 days')
  order by upcoming desc, v.id
  limit least(greatest(max_results, 1), 200);
$$;

create or replace function public.mark_venue_checked(p_venue_id bigint)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.venues set coords_checked_at = now() where id = p_venue_id;
$$;

-- ---------------------------------------------------------------------------
-- Ingestion des matchs (réservé au serveur)
-- ---------------------------------------------------------------------------

-- Reçoit une journée de matchs déjà normalisée par la fonction de synchronisation
-- et met tout à jour en une transaction : compétitions, équipes, stades, matchs.
create or replace function public.ingest_fixtures(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n_fixtures integer;
  n_venues integer;
  n_located integer;
begin
  insert into public.competitions (source_key, name, country, level, logo_url)
  select x.source_key, x.name, x.country, coalesce(x.level, 'other'), x.logo_url
  from jsonb_to_recordset(coalesce(payload -> 'competitions', '[]'::jsonb))
    as x (source_key text, name text, country text, level text, logo_url text)
  on conflict (source_key) do update
  set name = excluded.name,
      country = excluded.country,
      logo_url = excluded.logo_url,
      level = case when competitions.level_locked then competitions.level else excluded.level end;

  insert into public.teams (source_key, slug, name, country, logo_url)
  select x.source_key, public.slugify(x.name), x.name, x.country, x.logo_url
  from jsonb_to_recordset(coalesce(payload -> 'teams', '[]'::jsonb))
    as x (source_key text, name text, country text, logo_url text)
  order by x.source_key
  on conflict (source_key) do update
  set name = excluded.name,
      country = coalesce(excluded.country, teams.country),
      logo_url = excluded.logo_url;

  insert into public.venues (source_key, slug, name, city, country, search_name)
  select
    x.source_key, public.slugify(concat_ws(' ', x.name, x.city)), x.name, x.city, x.country,
    public.search_key(concat_ws(' ', x.name, x.city))
  from jsonb_to_recordset(coalesce(payload -> 'venues', '[]'::jsonb))
    as x (source_key text, name text, city text, country text)
  order by x.source_key
  on conflict (source_key) do update
  set name = excluded.name,
      city = coalesce(excluded.city, venues.city),
      country = coalesce(excluded.country, venues.country),
      search_name = excluded.search_name;
  get diagnostics n_venues = row_count;

  -- Les stades sont situés avant d'insérer les matchs : leur fuseau sert à dater les slugs.
  perform public.apply_venue_overrides();
  n_located := public.apply_city_fallback();

  insert into public.fixtures (
    source_key, slug, competition_id, season, round,
    home_team_id, away_team_id, venue_id, kickoff_at, time_confirmed, status
  )
  select
    x.source_key,
    -- « 2026-03-14-lens-lille », daté à l'heure locale du stade quand elle est connue.
    concat_ws('-',
      to_char(x.kickoff_at at time zone coalesce(v.timezone, 'UTC'), 'YYYY-MM-DD'),
      public.slugify(h.name), public.slugify(a.name)),
    c.id, x.season, x.round,
    h.id, a.id, v.id, x.kickoff_at, coalesce(x.time_confirmed, true), coalesce(x.status, 'scheduled')
  from jsonb_to_recordset(coalesce(payload -> 'fixtures', '[]'::jsonb))
    as x (
      source_key text, competition_key text, season integer, round text,
      home_key text, away_key text, venue_key text,
      kickoff_at timestamptz, time_confirmed boolean, status text
    )
  join public.competitions c on c.source_key = x.competition_key
  join public.teams h on h.source_key = x.home_key
  join public.teams a on a.source_key = x.away_key
  left join public.venues v on v.source_key = x.venue_key
  -- Si deux matchs visent le même slug, celui qui se joue vraiment est servi en premier.
  order by (coalesce(x.status, 'scheduled') in ('cancelled', 'postponed')), x.kickoff_at, x.source_key
  on conflict (source_key) do update
  set competition_id = excluded.competition_id,
      season = excluded.season,
      round = excluded.round,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      venue_id = coalesce(excluded.venue_id, fixtures.venue_id),
      kickoff_at = excluded.kickoff_at,
      time_confirmed = excluded.time_confirmed,
      status = excluded.status;
  get diagnostics n_fixtures = row_count;

  -- Stade habituel d'une équipe : celui de son match à domicile le plus récent du lot.
  update public.teams t
  set venue_id = latest.venue_id
  from (
    select distinct on (f.home_team_id) f.home_team_id, f.venue_id
    from public.fixtures f
    where f.venue_id is not null
      and f.source_key in (
        select x.source_key from jsonb_to_recordset(coalesce(payload -> 'fixtures', '[]'::jsonb))
          as x (source_key text)
      )
    order by f.home_team_id, f.kickoff_at desc
  ) latest
  where latest.home_team_id = t.id
    and t.venue_id is distinct from latest.venue_id;

  if payload ? 'day' then
    insert into public.sync_days (day, synced_at, fixtures_count)
    values ((payload ->> 'day')::date, now(), n_fixtures)
    on conflict (day) do update
    set synced_at = excluded.synced_at, fixtures_count = excluded.fixtures_count;
  end if;

  return jsonb_build_object(
    'fixtures', n_fixtures,
    'venues', n_venues,
    'venues_located_by_city', n_located
  );
end;
$$;

-- Jours à synchroniser en priorité : jamais vus d'abord, puis les plus anciens,
-- en rafraîchissant deux fois plus souvent les trois prochains jours.
create or replace function public.days_to_sync(days_ahead integer default 21, max_results integer default 3)
returns table (day date)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select d::date as day
  from generate_series(current_date, current_date + (least(greatest(days_ahead, 1), 60) - 1), interval '1 day') as d
  left join public.sync_days s on s.day = d::date
  order by
    (s.synced_at is not null),
    extract(epoch from (now() - s.synced_at)) * (case when d::date <= current_date + 2 then 2 else 1 end) desc,
    d
  limit least(greatest(max_results, 1), 60);
$$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------

alter table public.places enable row level security;
alter table public.country_aliases enable row level security;
alter table public.competitions enable row level security;
alter table public.venues enable row level security;
alter table public.venue_overrides enable row level security;
alter table public.teams enable row level security;
alter table public.fixtures enable row level security;
alter table public.sync_days enable row level security;
alter table public.sync_runs enable row level security;
alter table public.geocode_cache enable row level security;

-- Lecture publique des données sportives ; aucune écriture hors service_role.
create policy "Lecture publique" on public.places for select to anon, authenticated using (true);
create policy "Lecture publique" on public.competitions for select to anon, authenticated using (true);
create policy "Lecture publique" on public.venues for select to anon, authenticated using (true);
create policy "Lecture publique" on public.teams for select to anon, authenticated using (true);
create policy "Lecture publique" on public.fixtures for select to anon, authenticated using (true);

revoke all on public.places, public.country_aliases, public.competitions, public.venues,
  public.venue_overrides, public.teams, public.fixtures, public.sync_days, public.sync_runs,
  public.geocode_cache from anon, authenticated;
grant select on public.places, public.competitions, public.venues, public.teams, public.fixtures
  to anon, authenticated;
grant select on public.fixture_cards, public.venue_pages, public.team_pages to anon, authenticated;

revoke all on function
  public.ingest_fixtures(jsonb),
  public.set_venue_coords(bigint, double precision, double precision, text, real, text),
  public.apply_venue_overrides(),
  public.apply_city_fallback(),
  public.venues_to_locate(integer),
  public.mark_venue_checked(bigint),
  public.days_to_sync(integer, integer),
  public.guess_city(text, text),
  public.venue_override_changed()
from public, anon, authenticated;

grant execute on function
  public.ingest_fixtures(jsonb),
  public.set_venue_coords(bigint, double precision, double precision, text, real, text),
  public.apply_venue_overrides(),
  public.apply_city_fallback(),
  public.venues_to_locate(integer),
  public.mark_venue_checked(bigint),
  public.days_to_sync(integer, integer),
  public.guess_city(text, text)
to service_role;

grant execute on function
  public.search_fixtures(double precision, double precision, double precision, date, date, text[], text[], integer),
  public.search_places(text, integer),
  public.slugify(text),
  public.search_key(text)
to anon, authenticated;
