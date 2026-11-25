-- Tests des migrations : ingestion, slugs, recherche, coordonnées, droits.
-- Chaque bloc lève une erreur si une attente n'est pas tenue (psql -v ON_ERROR_STOP=1).

begin;

insert into public.places
  (geoname_id, name, search_name, alt_names, country_code, country_name, admin1, population, timezone, location)
values
  (1, 'Lens', 'lens', '', 'FR', 'France', 'Hauts-de-France', 31000, 'Europe/Paris',
   st_setsrid(st_makepoint(2.8333, 50.4333), 4326)::geography),
  (3, 'London', 'london', ',londres,londra,', 'GB', 'United Kingdom', 'England', 8900000, 'Europe/London',
   st_setsrid(st_makepoint(-0.1257, 51.5085), 4326)::geography),
  (4, 'Lens', 'lens', '', 'BE', 'Belgium', 'Wallonia', 4000, 'Europe/Brussels',
   st_setsrid(st_makepoint(3.9, 50.55), 4326)::geography),
  (5, 'Tokyo', 'tokyo', '', 'JP', 'Japan', 'Tokyo', 9000000, 'Asia/Tokyo',
   st_setsrid(st_makepoint(139.69, 35.69), 4326)::geography);

select public.ingest_fixtures('{
  "day": "2031-03-15",
  "competitions": [
    {"source_key": "af:61", "name": "Ligue 1", "country": "France", "level": "top"},
    {"source_key": "af:39", "name": "Premier League", "country": "England", "level": "top"},
    {"source_key": "af:98", "name": "J1 League", "country": "Japan", "level": "top"}
  ],
  "teams": [
    {"source_key": "af:116", "name": "Lens", "country": "France"},
    {"source_key": "af:79", "name": "Lille", "country": "France"},
    {"source_key": "af:40", "name": "Liverpool", "country": "England"},
    {"source_key": "af:2350", "name": "Liverpool", "country": "Uruguay"},
    {"source_key": "af:42", "name": "Arsenal", "country": "England"},
    {"source_key": "af:300", "name": "FC Tokyo", "country": "Japan"},
    {"source_key": "af:301", "name": "Urawa", "country": "Japan"}
  ],
  "venues": [
    {"source_key": "af:652", "name": "Stade Bollaert-Delelis", "city": "Lens", "country": "France"},
    {"source_key": "af:494", "name": "Emirates Stadium", "city": "London", "country": "England"},
    {"source_key": "af:700", "name": "Ajinomoto Stadium", "city": "Tokyo", "country": "Japan"},
    {"source_key": "af:900", "name": "Stade Inconnu", "city": "Nulle-Part", "country": "France"}
  ],
  "fixtures": [
    {"source_key": "af:1", "competition_key": "af:61", "season": 2030, "round": "R28",
     "home_key": "af:116", "away_key": "af:79", "venue_key": "af:652",
     "kickoff_at": "2031-03-15T20:00:00Z", "time_confirmed": true, "status": "scheduled"},
    {"source_key": "af:5", "competition_key": "af:61", "season": 2030, "round": "R28",
     "home_key": "af:116", "away_key": "af:79", "venue_key": null,
     "kickoff_at": "2031-03-15T10:00:00Z", "time_confirmed": true, "status": "cancelled"},
    {"source_key": "af:3", "competition_key": "af:39", "season": 2030, "round": "R30",
     "home_key": "af:42", "away_key": "af:40", "venue_key": "af:494",
     "kickoff_at": "2031-03-15T12:30:00Z", "time_confirmed": false, "status": "scheduled"},
    {"source_key": "af:4", "competition_key": "af:98", "season": 2031, "round": "R4",
     "home_key": "af:300", "away_key": "af:301", "venue_key": "af:700",
     "kickoff_at": "2031-03-15T16:00:00Z", "time_confirmed": true, "status": "scheduled"}
  ]
}'::jsonb);

do $$
declare
  n integer;
begin
  -- Slugs : calculés par la base, uniques, datés à l'heure locale du stade.
  assert (select slug from public.fixtures where source_key = 'af:1') = '2031-03-15-lens-lille',
    'le match qui se joue prend le slug sans suffixe';
  assert (select slug from public.fixtures where source_key = 'af:5') = '2031-03-15-lens-lille-2',
    'le doublon annulé prend un suffixe';
  assert (select slug from public.fixtures where source_key = 'af:4') = '2031-03-16-fc-tokyo-urawa',
    '16:00 UTC le 15 = le 16 à Tokyo';
  assert (select count(distinct slug) from public.teams where name = 'Liverpool') = 2,
    'deux clubs homonymes ont deux slugs';
  assert exists (select from public.teams where slug in ('liverpool-england', 'liverpool-uruguay')),
    'l''homonyme est départagé par son pays';

  -- Position de secours et fuseau.
  assert (select coords_source from public.venues where source_key = 'af:652') = 'city';
  assert (select timezone from public.venues where source_key = 'af:652') = 'Europe/Paris';
  assert (select location is null from public.venues where source_key = 'af:900'),
    'ville inconnue : pas de position inventée';
  assert (select venue_slug from public.team_pages where slug = 'lens') = 'stade-bollaert-delelis-lens';

  -- Ré-ingestion : rien n'est dupliqué, les slugs ne bougent pas, l'horaire est mis à jour.
  perform public.ingest_fixtures('{
    "day": "2031-03-15",
    "competitions": [{"source_key": "af:61", "name": "Ligue 1", "country": "France", "level": "lower"}],
    "teams": [{"source_key": "af:116", "name": "RC Lens", "country": "France"},
              {"source_key": "af:79", "name": "Lille", "country": "France"}],
    "venues": [{"source_key": "af:652", "name": "Stade Bollaert-Delelis", "city": "Lens", "country": "France"}],
    "fixtures": [{"source_key": "af:1", "competition_key": "af:61", "home_key": "af:116", "away_key": "af:79",
                  "venue_key": "af:652", "kickoff_at": "2031-03-15T19:45:00Z", "time_confirmed": true,
                  "status": "scheduled"}]
  }'::jsonb);
  assert (select count(*) from public.fixtures) = 4;
  assert (select slug from public.teams where source_key = 'af:116') = 'lens', 'le slug d''un club est figé';
  assert (select name from public.teams where source_key = 'af:116') = 'RC Lens';
  assert (select kickoff_at from public.fixtures where source_key = 'af:1') = '2031-03-15T19:45:00Z';
  assert (select slug from public.fixtures where source_key = 'af:1') = '2031-03-15-lens-lille';

  -- Niveau verrouillé : la synchronisation n'y touche plus.
  update public.competitions set level = 'top', level_locked = true where source_key = 'af:61';
  perform public.ingest_fixtures('{"competitions": [{"source_key": "af:61", "name": "Ligue 1", "level": "other"}]}'::jsonb);
  assert (select level from public.competitions where source_key = 'af:61') = 'top';

  -- Coordonnées : la correction manuelle gagne, une source moins fiable ne remplace pas une meilleure.
  insert into public.venue_overrides (source_key, lat, lng) values ('af:652', 50.4328, 2.8149);
  assert (select coords_source from public.venues where source_key = 'af:652') = 'manual';
  assert not public.set_venue_coords((select id from public.venues where source_key = 'af:652'),
    1, 1, 'wikidata', 0.9::real), 'wikidata ne remplace pas une correction manuelle';
  assert public.set_venue_coords((select id from public.venues where source_key = 'af:494'),
    51.555, -0.1086, 'wikidata', 0.9::real, 'Q215179'), 'wikidata remplace le centre-ville';
  assert not public.set_venue_coords((select id from public.venues where source_key = 'af:494'),
    51.5, -0.1, 'nominatim', 0.75::real), 'nominatim ne remplace pas wikidata';
  assert (select count(*) from public.venues_to_locate(10)) = 2, 'restent Tokyo (centre-ville) et le stade inconnu';

  -- Recherche : rayon, dates locales, tri.
  select count(*) into n from public.search_fixtures(50.43, 2.83, 50, '2031-03-15', '2031-03-15');
  assert n = 1, 'un match autour de Lens le 15 (l''annulé est écarté)';
  assert (select distance_km < 2 from public.search_fixtures(50.43, 2.83, 50, '2031-03-15', '2031-03-15'));
  assert (select count(*) from public.search_fixtures(50.43, 2.83, 50, '2031-03-16', '2031-03-16')) = 0;
  assert (select count(*) from public.search_fixtures(35.69, 139.69, 50, '2031-03-15', '2031-03-15')) = 0,
    'à Tokyo, le match est le 16';
  assert (select count(*) from public.search_fixtures(35.69, 139.69, 50, '2031-03-16', '2031-03-16')) = 1;
  assert (select array_agg(slug) from public.search_fixtures(51.5, -0.12, 300, '2031-03-14', '2031-03-17'))
    = array['2031-03-15-arsenal-liverpool', '2031-03-15-lens-lille'], 'tri par jour puis par distance';
  assert (select count(*) from public.search_fixtures(51.5, -0.12, 300, '2031-03-14', '2031-03-17', array['cup'])) = 0;
  assert (select count(*) from public.search_fixtures(51.5, -0.12, 99999, '2031-03-14', '2099-01-01')) <= 3,
    'rayon et période sont bornés';

  -- Suggestions de lieux.
  assert (select name from public.search_places('Londres') limit 1) = 'London';
  assert (select array_agg(detail) from public.search_places('len') where kind = 'city')
    = array['Hauts-de-France, France', 'Wallonia, Belgium'], 'villes triées par population';
  assert exists (select from public.search_places('émir') where kind = 'venue' and name = 'Emirates Stadium');
  assert (select count(*) from public.search_places('%%')) = 0, 'les jokers ne ramènent rien';
  assert (select count(*) from public.search_places('l')) = 0, 'il faut au moins deux lettres';

  -- Journées à synchroniser, détails des stades.
  assert (select count(*) from public.days_to_sync(21, 3)) = 3;
  assert public.ingest_venue_details('{"country": "France", "venues": [
    {"source_key": "af:652", "address": "Avenue Alfred Maes", "capacity": 38223, "surface": "grass"},
    {"source_key": "af:inconnu", "capacity": 1}]}'::jsonb) = 1;
  assert (select capacity from public.venue_pages where slug = 'stade-bollaert-delelis-lens') = 38223;

  -- Sitemap et fraîcheur.
  assert (select count(*) from public.sitemap_entries() where kind = 'match') = 3;
  assert exists (select from public.sitemap_entries() where kind = 'venue' and slug = 'stade-bollaert-delelis-lens');
  assert exists (select from public.sitemap_entries() where kind = 'team' and slug = 'lens');
  assert (select fixtures_synced_at is null and upcoming_fixtures = 3 from public.data_status());
  insert into public.sync_runs (kind, finished_at, ok) values ('fixtures', now(), true);
  assert (select fixtures_synced_at is not null from public.data_status());
end
$$;

-- Droits : un visiteur lit les données publiques et rien d'autre.
set local role anon;
do $$
begin
  assert (select count(*) from public.fixture_cards) = 4;
  assert (select count(*) from public.search_fixtures(50.43, 2.83, 50, '2031-03-15', '2031-03-15')) = 1;
  assert (select count(*) from public.sitemap_entries()) > 0;

  begin
    insert into public.venues (source_key, slug, name) values ('x', 'x', 'x');
    raise exception 'un visiteur ne doit pas pouvoir écrire';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ingest_fixtures('{}'::jsonb);
    raise exception 'un visiteur ne doit pas pouvoir ingérer';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.venue_overrides;
    raise exception 'un visiteur ne doit pas lire les tables internes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.fixture_interest;
    raise exception 'un visiteur ne doit pas lire qui va où';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
