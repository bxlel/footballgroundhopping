-- Tests du social : « J'y vais » sans compte, profils privés, blocage, signalement, check-in.

begin;

insert into public.places
  (geoname_id, name, search_name, country_code, country_name, timezone, location)
values
  (1, 'Lens', 'lens', 'FR', 'France', 'Europe/Paris', st_setsrid(st_makepoint(2.8333, 50.4333), 4326)::geography);

-- Un match dans une heure (check-in ouvert), un dans dix jours, un terminé hier.
select public.ingest_fixtures(jsonb_build_object(
  'competitions', '[{"source_key": "af:61", "name": "Ligue 1", "country": "France", "level": "top"}]'::jsonb,
  'teams', '[{"source_key": "af:116", "name": "Lens", "country": "France"},
             {"source_key": "af:79", "name": "Lille", "country": "France"},
             {"source_key": "af:80", "name": "Lyon", "country": "France"}]'::jsonb,
  'venues', '[{"source_key": "af:652", "name": "Stade Bollaert-Delelis", "city": "Lens", "country": "France"}]'::jsonb,
  'fixtures', jsonb_build_array(
    jsonb_build_object('source_key', 'af:1', 'competition_key', 'af:61', 'home_key', 'af:116', 'away_key', 'af:79',
      'venue_key', 'af:652', 'kickoff_at', now() + interval '1 hour', 'status', 'scheduled'),
    jsonb_build_object('source_key', 'af:2', 'competition_key', 'af:61', 'home_key', 'af:116', 'away_key', 'af:80',
      'venue_key', 'af:652', 'kickoff_at', now() + interval '10 days', 'status', 'scheduled'),
    jsonb_build_object('source_key', 'af:3', 'competition_key', 'af:61', 'home_key', 'af:79', 'away_key', 'af:80',
      'venue_key', 'af:652', 'kickoff_at', now() - interval '1 day', 'status', 'finished')
  )
));
insert into public.venue_overrides (source_key, lat, lng) values ('af:652', 50.4328, 2.8149);

-- ---------------------------------------------------------------------------
-- « J'y vais », en visiteur anonyme
-- ---------------------------------------------------------------------------
set local role anon;
do $$
declare
  soon text := (select slug from public.fixture_cards where home_name = 'Lens' and away_name = 'Lille');
  later text := (select slug from public.fixture_cards where away_name = 'Lyon' and home_name = 'Lens');
  past text := (select slug from public.fixture_cards where home_name = 'Lille');
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  r record;
begin
  select * into r from public.set_going(soon, a, true);
  assert r.going and r.going_count = 1;
  select * into r from public.set_going(soon, a, true);
  assert r.going_count = 1, 'marquer deux fois ne compte qu''une fois';
  select * into r from public.set_going(soon, b, true);
  assert r.going_count = 2;
  assert (select going_count from public.fixture_cards where slug = soon) = 2, 'le compteur est lisible';

  perform public.set_going(later, a, true);
  assert (select array_agg(s order by s) from public.my_going(a, array[soon, later, past]) s)
    = (select array_agg(s order by s) from unnest(array[soon, later]) s);
  assert (select count(*) from public.my_going(b, array[later])) = 0;

  select * into r from public.set_going(soon, a, false);
  assert not r.going and r.going_count = 1;
  select * into r from public.set_going(soon, a, false);
  assert r.going_count = 1, 'retirer deux fois ne décompte qu''une fois';

  begin
    perform public.set_going(past, a, true);
    raise exception 'on ne va pas à un match terminé';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_going('match-qui-n-existe-pas', a, true);
    raise exception 'un match inconnu doit être refusé';
  exception when no_data_found then null;
  end;
  begin
    perform public.check_in(1, 50.4328, 2.8149);
    raise exception 'le check-in demande un compte';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

do $$
begin
  assert (select updated_at = created_at from public.fixtures where source_key = 'af:1'),
    'le compteur ne change pas la date de mise à jour du match';
end
$$;

-- ---------------------------------------------------------------------------
-- Comptes : trois personnes
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');
insert into public.profiles (id, username, is_private) values
  ('00000000-0000-4000-8000-000000000001', 'alice', false),
  ('00000000-0000-4000-8000-000000000002', 'bob', true),
  ('00000000-0000-4000-8000-000000000003', 'chloe', false);
insert into public.tips (venue_id, user_id, body, status)
select id, '00000000-0000-4000-8000-000000000001', 'Arrive tôt, la tribune Marek se remplit vite.', 'published'
from public.venues where source_key = 'af:652';

-- Alice.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
declare
  alice uuid := '00000000-0000-4000-8000-000000000001';
  bob uuid := '00000000-0000-4000-8000-000000000002';
  chloe uuid := '00000000-0000-4000-8000-000000000003';
  soon bigint := (select id from public.fixtures where source_key = 'af:1');
  later bigint := (select id from public.fixtures where source_key = 'af:2');
  r record;
begin
  -- Profil privé : invisible tant qu'on ne le suit pas.
  assert (select count(*) from public.profiles) = 2, 'Alice voit son profil et celui de Chloé, pas celui de Bob';
  insert into public.follows (follower_id, followed_id) values (alice, chloe);
  begin
    insert into public.follows (follower_id, followed_id) values (chloe, alice);
    raise exception 'on ne peut pas abonner quelqu''un d''autre';
  exception when insufficient_privilege then null;
  end;

  -- Champs protégés.
  update public.profiles set display_name = 'Alice' where id = alice;
  begin
    update public.profiles set xp = 9999 where id = alice;
    raise exception 'l''XP ne s''écrit pas depuis le navigateur';
  exception when insufficient_privilege then null;
  end;

  -- Check-in : trop loin, puis sur place, puis en double, puis hors fenêtre.
  begin
    perform public.check_in(soon, 48.8566, 2.3522);
    raise exception 'un check-in depuis Paris doit être refusé';
  exception when invalid_parameter_value then null;
  end;
  select * into r from public.check_in(soon, 50.4330, 2.8150);
  assert r.verified and r.distance_m < 100, 'sur place : check-in vérifié';
  begin
    perform public.check_in(soon, 50.4330, 2.8150);
    raise exception 'un seul check-in par match';
  exception when unique_violation then null;
  end;
  begin
    perform public.check_in(later, 50.4330, 2.8150);
    raise exception 'le check-in n''ouvre que 2 h avant le match';
  exception when invalid_parameter_value then null;
  end;
  assert (select count(*) from public.checkins) = 1, 'Alice voit son check-in';
  begin
    insert into public.checkins (user_id, fixture_id, verified) values (alice, later, true);
    raise exception 'un check-in ne s''insère pas à la main';
  exception when insufficient_privilege then null;
  end;

  -- Signalement : une fois par contenu.
  insert into public.reports (reporter_id, target_type, target_id, reason)
  select alice, 'tip', id::text, 'spam' from public.tips;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    select alice, 'tip', id::text, 'spam' from public.tips;
    raise exception 'un contenu ne se signale qu''une fois par personne';
  exception when unique_violation then null;
  end;
end
$$;

-- Chloé : suit Alice, la bloque, ne peut plus être suivie par elle.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$
declare
  alice uuid := '00000000-0000-4000-8000-000000000001';
  chloe uuid := '00000000-0000-4000-8000-000000000003';
begin
  assert (select count(*) from public.checkins) = 0, 'Chloé ne voit pas le check-in d''Alice';
  insert into public.follows (follower_id, followed_id) values (chloe, alice);
  insert into public.blocks (blocker_id, blocked_id) values (chloe, alice);
  assert (select count(*) from public.follows where chloe in (follower_id, followed_id)) = 0,
    'bloquer rompt les abonnements dans les deux sens';
  assert (select count(*) from public.profiles where id = alice) = 0, 'Chloé ne voit plus Alice';
  begin
    insert into public.follows (follower_id, followed_id) values (chloe, alice);
    raise exception 'on ne suit pas quelqu''un qu''on a bloqué';
  exception when insufficient_privilege then null;
  end;
  insert into public.reports (reporter_id, target_type, target_id, reason)
  select chloe, 'tip', id::text, 'abuse' from public.tips;
  assert (select count(*) from public.reports) = 1, 'chacun ne voit que ses signalements';
end
$$;

-- Bob (profil privé) : troisième signalement, le conseil repasse en modération.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
declare
  bob uuid := '00000000-0000-4000-8000-000000000002';
begin
  assert (select count(*) from public.tips) = 1, 'le conseil est encore publié';
  insert into public.reports (reporter_id, target_type, target_id, reason)
  select bob, 'tip', id::text, 'wrong_info' from public.tips;
  assert (select count(*) from public.tips) = 0, 'trois signalements : le conseil n''est plus public';
end
$$;

-- Alice de nouveau : Chloé l'a bloquée.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
declare
  alice uuid := '00000000-0000-4000-8000-000000000001';
  chloe uuid := '00000000-0000-4000-8000-000000000003';
begin
  assert (select count(*) from public.profiles where id = chloe) = 0, 'Alice ne voit plus Chloé';
  assert (select count(*) from public.blocks) = 0, 'Alice ne sait pas qui l''a bloquée';
  begin
    insert into public.follows (follower_id, followed_id) values (alice, chloe);
    raise exception 'on ne suit pas quelqu''un qui nous a bloqué';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.tips) = 1, 'l''auteur voit toujours son conseil en attente';
end
$$;
reset role;

rollback;
