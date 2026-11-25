-- Détails des stades (adresse, capacité, pelouse, photo), récupérés pays par pays
-- auprès du fournisseur de matchs. Une requête par pays : c'est lent, donc étalé dans le temps.

create table public.sync_countries (
  country text primary key,
  synced_at timestamptz not null default now(),
  venues_count integer not null default 0
);

alter table public.sync_countries enable row level security;
revoke all on public.sync_countries from anon, authenticated;

-- Pays dont les stades restent à compléter : ceux qui ont le plus de stades sans capacité,
-- jamais synchronisés d'abord, puis ceux qui ne l'ont pas été depuis 60 jours.
create or replace function public.countries_to_sync(max_results integer default 5)
returns table (country text, missing integer)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select v.country, count(*) filter (where v.capacity is null)::integer as missing
  from public.venues v
  left join public.sync_countries s on s.country = v.country
  where v.country is not null
    and v.source_key not like 'af:n:%'
    and (s.synced_at is null or s.synced_at < now() - interval '60 days')
  group by v.country, s.synced_at
  having count(*) filter (where v.capacity is null) > 0
  order by (s.synced_at is not null), missing desc, v.country
  limit least(greatest(max_results, 1), 50);
$$;

-- Complète les stades déjà connus ; n'en crée pas (seuls les stades où un match se joue nous intéressent).
create or replace function public.ingest_venue_details(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  changed integer;
begin
  update public.venues v
  set address = coalesce(x.address, v.address),
      capacity = coalesce(x.capacity, v.capacity),
      surface = coalesce(x.surface, v.surface),
      image_url = coalesce(x.image_url, v.image_url),
      city = coalesce(v.city, x.city)
  from jsonb_to_recordset(coalesce(payload -> 'venues', '[]'::jsonb))
    as x (source_key text, address text, city text, capacity integer, surface text, image_url text)
  where x.source_key = v.source_key;
  get diagnostics changed = row_count;

  if payload ? 'country' then
    insert into public.sync_countries (country, synced_at, venues_count)
    values (payload ->> 'country', now(), changed)
    on conflict (country) do update
    set synced_at = excluded.synced_at, venues_count = excluded.venues_count;
  end if;

  return changed;
end;
$$;

revoke all on function public.countries_to_sync(integer), public.ingest_venue_details(jsonb)
  from public, anon, authenticated;
grant execute on function public.countries_to_sync(integer), public.ingest_venue_details(jsonb)
  to service_role;
