-- Garde-fous du social, posés avant d'ouvrir les comptes : profils privés, blocage,
-- signalement, et check-in validé par le serveur. Plus simple à avoir dès le départ
-- qu'à ajouter une fois la communauté en place.

-- ---------------------------------------------------------------------------
-- Profils privés et blocage
-- ---------------------------------------------------------------------------

alter table public.profiles add column is_private boolean not null default false;

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

create policy "Voir ses blocages" on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "Bloquer" on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy "Débloquer" on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- Vrai si l'un des deux a bloqué l'autre. Fonction « definer » : les règles RLS s'en servent
-- sans exposer la table des blocages.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.blocks k
    where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a)
  );
$$;

create or replace function public.is_following(follower uuid, followed uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.follows f where f.follower_id = follower and f.followed_id = followed
  );
$$;

-- Un profil privé n'est visible que de son propriétaire et de ses abonnés ;
-- un profil n'est jamais visible de quelqu'un qu'il a bloqué (et inversement).
drop policy "Profils publics" on public.profiles;
create policy "Profils visibles" on public.profiles for select to anon, authenticated
  using (
    id = (select auth.uid())
    or (
      (not is_private or public.is_following((select auth.uid()), id))
      and not public.is_blocked_between((select auth.uid()), id)
    )
  );

-- On ne peut pas suivre quelqu'un avec qui il y a un blocage.
drop policy "Suivre" on public.follows;
create policy "Suivre" on public.follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not public.is_blocked_between(follower_id, followed_id)
  );

-- Bloquer quelqu'un rompt les abonnements dans les deux sens.
create or replace function public.unfollow_on_block()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.follows f
  where (f.follower_id = new.blocker_id and f.followed_id = new.blocked_id)
     or (f.follower_id = new.blocked_id and f.followed_id = new.blocker_id);
  return new;
end;
$$;

create trigger blocks_unfollow after insert on public.blocks
  for each row execute function public.unfollow_on_block();

alter table public.profiles add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) between 1 and 40);
grant update (is_private) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Signalements
-- ---------------------------------------------------------------------------

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'tip', 'checkin')),
  target_id text not null check (char_length(target_id) between 1 and 64),
  reason text not null check (reason in ('spam', 'abuse', 'wrong_info', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  -- Un même contenu ne se signale qu'une fois par personne.
  unique (reporter_id, target_type, target_id)
);

create index reports_open_idx on public.reports (created_at) where status = 'open';

alter table public.reports enable row level security;

create policy "Voir ses signalements" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy "Signaler" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');

-- Un conseil signalé trois fois repasse en modération sans attendre.
create or replace function public.hide_reported_tip()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.target_type = 'tip'
     and (select count(*) from public.reports r
          where r.target_type = 'tip' and r.target_id = new.target_id and r.status = 'open') >= 3 then
    update public.tips t set status = 'pending'
    where t.id::text = new.target_id and t.status = 'published';
  end if;
  return new;
end;
$$;

create trigger reports_hide_tip after insert on public.reports
  for each row execute function public.hide_reported_tip();

-- ---------------------------------------------------------------------------
-- Check-in : validé par le serveur, jamais par le navigateur
-- ---------------------------------------------------------------------------

-- Fenêtre : de 2 h avant à 3 h après le coup d'envoi. Rayon : 750 m autour du stade.
-- Si le stade n'a qu'une position approximative, le check-in est enregistré mais non vérifié.
create or replace function public.check_in(p_fixture_id bigint, p_lat double precision, p_lng double precision)
returns table (checkin_id bigint, verified boolean, distance_m integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_fixture public.fixtures%rowtype;
  v_venue public.venues%rowtype;
  v_point geography;
  v_distance double precision;
  v_verified boolean := false;
  v_id bigint;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    raise exception 'Position invalide' using errcode = '22023';
  end if;

  select * into v_fixture from public.fixtures f where f.id = p_fixture_id;
  if not found then
    raise exception 'Match introuvable' using errcode = 'P0002';
  end if;
  if v_fixture.status = 'cancelled' or v_fixture.status = 'postponed' then
    raise exception 'Ce match ne se joue pas' using errcode = '22023';
  end if;
  if now() < v_fixture.kickoff_at - interval '2 hours' or now() > v_fixture.kickoff_at + interval '3 hours' then
    raise exception 'Le check-in ouvre 2 h avant le coup d''envoi et ferme 3 h après' using errcode = '22023';
  end if;
  -- Un seul stade à la fois : pas plus de 3 check-ins par jour.
  if (select count(*) from public.checkins c
      where c.user_id = v_user and c.checked_in_at > now() - interval '1 day') >= 3 then
    raise exception 'Trop de check-ins aujourd''hui' using errcode = '54000';
  end if;

  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  select * into v_venue from public.venues v where v.id = v_fixture.venue_id;
  if found and v_venue.location is not null then
    v_distance := st_distance(v_venue.location, v_point);
    if v_venue.coords_source <> 'city' then
      if v_distance > 750 then
        raise exception 'Tu es trop loin du stade' using errcode = '22023';
      end if;
      v_verified := true;
    end if;
  end if;

  insert into public.checkins (user_id, fixture_id, venue_id, location, verified)
  values (v_user, v_fixture.id, v_fixture.venue_id, v_point, v_verified)
  on conflict (user_id, fixture_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Check-in déjà fait pour ce match' using errcode = '23505';
  end if;

  return query select v_id, v_verified, round(v_distance)::integer;
end;
$$;

revoke all on function public.check_in(bigint, double precision, double precision) from public, anon;
grant execute on function public.check_in(bigint, double precision, double precision) to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid), public.is_following(uuid, uuid)
  to anon, authenticated;

revoke all on public.blocks, public.reports from anon;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
