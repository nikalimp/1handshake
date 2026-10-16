-- Events: a second way into the club.
-- 1. Any member hosts an event: cover, title, markdown, dates, place, price, registration link.
--    It shows in the feed of the host's circle right away; an admin approves it for everyone,
--    the public calendar and check-in.
-- 2. event_people: who's going (intent, from the feed) and who checked in at the venue (QR).
-- 3. The check-in QR is for members: it works only for approved events, around their dates.
--    Newcomers still join the classic way — a selfie with a member they met (at the event, too).
-- 4. Members checked in at the same event find each other on connect and connect without mutuals.
--    Both tapping connect, or one accepting, makes a "met" connection that remembers the event.

-- 1. Events ------------------------------------------------------------------------------------
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  host_id          uuid not null references public.profiles (id) on delete cascade,
  title            text not null check (char_length(title) between 3 and 120),
  body_md          text not null default '' check (char_length(body_md) <= 8000),
  cover_path       text check (char_length(cover_path) <= 300),       -- public bucket "covers"
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  timezone         text not null default 'UTC',
  online           boolean not null default false,
  city_id          int references public.cities (id),
  venue            text check (char_length(venue) <= 120),
  address          text check (char_length(address) <= 300),
  price            text check (char_length(price) <= 40),             -- shown as is: "free", "500 THB"
  registration_url text check (registration_url ~ '^https://' and char_length(registration_url) <= 500),
  source_url       text check (char_length(source_url) <= 500),       -- where it was imported from (luma)
  review           text not null default 'pending' check (review in ('pending', 'approved', 'rejected')),
  reviewed_at      timestamptz,
  checkin_code     text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists events_starts_idx on public.events (starts_at);
create index if not exists events_host_idx on public.events (host_id);

create table if not exists public.event_people (
  event_id      uuid not null references public.events (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  going_at      timestamptz,
  checked_in_at timestamptz,
  primary key (event_id, user_id)
);
create index if not exists event_people_user_idx on public.event_people (user_id);

alter table public.connections add column if not exists event_id uuid references public.events (id) on delete set null;
alter table public.intro_requests add column if not exists event_id uuid references public.events (id) on delete cascade;

-- Who sees an event: everyone once approved; before that the host, admins and the host's connections.
create or replace function public.can_see_event(p_host uuid, p_review text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_review = 'approved'
      or p_host = auth.uid()
      or public.is_admin()
      or (p_review = 'pending' and public.is_connected(auth.uid(), p_host)
          and exists (select 1 from public.profiles me where me.id = auth.uid() and me.status = 'active'));
$$;

alter table public.events enable row level security;
alter table public.event_people enable row level security;
drop policy if exists "events by review" on public.events;
create policy "events by review" on public.events for select using (public.can_see_event(host_id, review));
-- The check-in code is the key to the club: only the host and admins read it (event_checkin_code()).
revoke all on public.events from anon, authenticated;
grant select (id, slug, host_id, title, body_md, cover_path, starts_at, ends_at, timezone, online, city_id, venue, address,
              price, registration_url, source_url, review, reviewed_at, cancelled_at, created_at, updated_at)
  on public.events to anon, authenticated;

drop policy if exists "members see who goes" on public.event_people;
create policy "members see who goes" on public.event_people for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles me where me.id = auth.uid() and me.status = 'active')
);
grant select on public.event_people to authenticated;

-- 2. Hosting -----------------------------------------------------------------------------------
create or replace function public.event_slug(p_title text)
returns text language sql volatile set search_path = public as $$
  select coalesce(nullif(left(trim(both '-' from regexp_replace(lower(p_title), '[^a-z0-9]+', '-', 'g')), 40), ''), 'event')
         || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
$$;

-- Create (p_id null) or edit an event. Fields come as JSON; local times are read in the event's time zone:
-- {"title", "body_md", "cover_path", "starts_local": "2026-10-17T09:00", "ends_local", "timezone": "Asia/Bangkok",
--  "online", "city_id", "venue", "address", "price", "registration_url", "source_url"}
create or replace function public.save_event(p_id uuid, p jsonb)
returns table (id uuid, slug text, review text)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ev public.events;
  tz text := coalesce(nullif(trim(p->>'timezone'), ''), 'UTC');
  t_start timestamptz;
  t_end timestamptz;
  reg text := nullif(trim(p->>'registration_url'), '');
  cover text := nullif(trim(p->>'cover_path'), '');
begin
  if me is null or not exists (select 1 from public.profiles where profiles.id = me and status = 'active') then
    raise exception 'not a member';
  end if;
  if not exists (select 1 from pg_timezone_names where name = tz) then raise exception 'unknown time zone'; end if;
  begin
    t_start := (p->>'starts_local')::timestamp at time zone tz;
    t_end := nullif(p->>'ends_local', '')::timestamp at time zone tz;
  exception when others then
    raise exception 'bad date';
  end;
  if t_start is null then raise exception 'add a start date'; end if;
  if t_end is not null and t_end <= t_start then raise exception 'the end is before the start'; end if;
  if reg is not null and reg !~ '^https://' then raise exception 'registration link must start with https://'; end if;
  if cover is not null and cover not like me::text || '/%' and (p_id is null or cover is distinct from
     (select e.cover_path from public.events e where e.id = p_id)) then
    raise exception 'bad cover';
  end if;

  if p_id is null then
    insert into public.events (slug, host_id, title, body_md, cover_path, starts_at, ends_at, timezone, online, city_id,
                               venue, address, price, registration_url, source_url)
    values (public.event_slug(p->>'title'), me, trim(p->>'title'), coalesce(p->>'body_md', ''), cover, t_start, t_end, tz,
            coalesce((p->>'online')::boolean, false), nullif(p->>'city_id', '')::int,
            nullif(trim(p->>'venue'), ''), nullif(trim(p->>'address'), ''), nullif(trim(p->>'price'), ''),
            reg, nullif(trim(p->>'source_url'), ''))
    returning * into ev;
    -- the host is going to their own event
    insert into public.event_people (event_id, user_id, going_at) values (ev.id, me, now());
  else
    select * into ev from public.events e where e.id = p_id for update;
    if not found or (ev.host_id <> me and not public.is_admin()) then raise exception 'not your event'; end if;
    update public.events e
       set title = trim(p->>'title'), body_md = coalesce(p->>'body_md', ''), cover_path = cover,
           starts_at = t_start, ends_at = t_end, timezone = tz,
           online = coalesce((p->>'online')::boolean, false), city_id = nullif(p->>'city_id', '')::int,
           venue = nullif(trim(p->>'venue'), ''), address = nullif(trim(p->>'address'), ''),
           price = nullif(trim(p->>'price'), ''), registration_url = reg,
           source_url = coalesce(nullif(trim(p->>'source_url'), ''), e.source_url),
           -- a rejected event goes back to review after an edit
           review = case when e.review = 'rejected' then 'pending' else e.review end,
           updated_at = now()
     where e.id = p_id returning * into ev;
  end if;
  return query select ev.id, ev.slug, ev.review;
end $$;

create or replace function public.cancel_event(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.events set cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
   where id = p_event and (host_id = auth.uid() or public.is_admin());
  if not found then raise exception 'not your event'; end if;
end $$;

create or replace function public.review_event(p_event uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.events set review = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now()
   where id = p_event;
end $$;

-- The host's check-in code, and a fresh one when the old one leaked.
create or replace function public.event_checkin_code(p_event uuid)
returns text language sql stable security definer set search_path = public as $$
  select checkin_code from public.events where id = p_event and (host_id = auth.uid() or public.is_admin());
$$;

create or replace function public.new_checkin_code(p_event uuid)
returns text language sql security definer set search_path = public as $$
  update public.events set checkin_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
   where id = p_event and (host_id = auth.uid() or public.is_admin())
  returning checkin_code;
$$;

-- 3. Going and checking in -------------------------------------------------------------------------
create or replace function public.set_going(p_event uuid, p_going boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from public.profiles where id = me and status = 'active') then
    raise exception 'not a member';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event and e.cancelled_at is null
                 and public.can_see_event(e.host_id, e.review)) then
    raise exception 'event not found';
  end if;
  if p_going then
    insert into public.event_people (event_id, user_id, going_at) values (p_event, me, now())
    on conflict (event_id, user_id) do update set going_at = coalesce(event_people.going_at, now());
  else
    update public.event_people set going_at = null where event_id = p_event and user_id = me;
    delete from public.event_people where event_id = p_event and user_id = me and checked_in_at is null and going_at is null;
  end if;
end $$;

-- When the check-in QR works: from 3 hours before the start until 3 hours after the end
-- (an event without an end counts as 8 hours long).
create or replace function public.checkin_state(e public.events)
returns text language sql stable as $$
  select case
    when e.cancelled_at is not null then 'cancelled'
    when e.review <> 'approved' then 'not approved'
    when now() < e.starts_at - interval '3 hours' then 'not open yet'
    when now() > coalesce(e.ends_at, e.starts_at + interval '8 hours') + interval '3 hours' then 'over'
    else 'open'
  end;
$$;

-- What the check-in QR shows before anyone signs in. Works for anonymous visitors.
create or replace function public.event_by_code(p_code text)
returns table (id uuid, slug text, title text, cover_path text, starts_at timestamptz, ends_at timestamptz, timezone text,
               venue text, state text, here int)
language sql stable security definer set search_path = public as $$
  select e.id, e.slug, e.title, e.cover_path, e.starts_at, e.ends_at, e.timezone, e.venue, public.checkin_state(e),
         (select count(*)::int from public.event_people x where x.event_id = e.id and x.checked_in_at is not null)
  from public.events e where e.checkin_code = p_code;
$$;

-- A member scans the host's QR at the venue.
create or replace function public.event_check_in(p_code text)
returns table (event_id uuid, slug text, title text)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ev public.events;
  st text;
begin
  if me is null or not exists (select 1 from public.profiles where id = me and status = 'active') then
    raise exception 'not a member';
  end if;
  select * into ev from public.events e where e.checkin_code = p_code;
  if not found then raise exception 'code not found'; end if;
  st := public.checkin_state(ev);
  if st <> 'open' then raise exception 'check-in %', st; end if;
  -- the constraint by name: event_id is also an output column here
  insert into public.event_people (event_id, user_id, going_at, checked_in_at) values (ev.id, me, now(), now())
  on conflict on constraint event_people_pkey do update
    set checked_in_at = coalesce(event_people.checked_in_at, now()), going_at = coalesce(event_people.going_at, now());
  return query select ev.id, ev.slug, ev.title;
end $$;

-- 4. Connecting at an event ----------------------------------------------------------------------
create or replace function public.connect_at_event(a uuid, b uuid, ev uuid, req uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.connections (user_a, user_b, kind, request_id, event_id)
  values (least(a, b), greatest(a, b), 'met', req, ev)
  on conflict (user_a, user_b) do update
    set kind = 'met', event_id = excluded.event_id, request_id = coalesce(public.connections.request_id, excluded.request_id), created_at = now()
    where public.connections.kind = 'intro';
$$;
revoke all on function public.connect_at_event(uuid, uuid, uuid, uuid) from public;

-- People who checked in at an event I checked in at, not connected with me yet (the connect screen).
create or replace function public.people_from_events()
returns table (person uuid, event_id uuid, at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (o.user_id) o.user_id, o.event_id, greatest(o.checked_in_at, mine.checked_in_at)
  from public.event_people mine
  join public.event_people o on o.event_id = mine.event_id and o.user_id <> mine.user_id and o.checked_in_at is not null
  join public.profiles p on p.id = o.user_id and p.status = 'active' and p.open_to_hiring
  where mine.user_id = auth.uid() and mine.checked_in_at is not null
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.status = 'active')
    and not public.is_connected(auth.uid(), o.user_id)
    and not exists (select 1 from public.hidden h where h.profile_id = auth.uid() and h.hidden_id = o.user_id)
    and not exists (select 1 from public.intro_requests r
                    where r.from_id = auth.uid() and r.to_id = o.user_id and r.status = 'pending')
  order by o.user_id, mine.checked_in_at desc;
$$;

-- Connect with someone from the same event. If they already asked me, we're connected at once.
-- Returns 'requested' or 'connected'.
create or replace function public.request_event_connect(p_to uuid, p_event uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  back public.intro_requests;
begin
  if me is null or not exists (select 1 from public.profiles where id = me and status = 'active') then
    raise exception 'not a member';
  end if;
  if not exists (select 1 from public.event_people x where x.event_id = p_event and x.user_id = me and x.checked_in_at is not null)
     or not exists (select 1 from public.event_people x join public.profiles p on p.id = x.user_id and p.status = 'active' and p.open_to_hiring
                    where x.event_id = p_event and x.user_id = p_to and x.checked_in_at is not null) then
    raise exception 'not at this event together';
  end if;
  if public.is_connected(me, p_to) then return 'connected'; end if;
  select * into back from public.intro_requests r where r.from_id = p_to and r.to_id = me and r.status = 'pending' for update;
  if found then
    update public.intro_requests set status = 'accepted', decided_at = now() where id = back.id;
    perform public.connect_at_event(me, p_to, p_event, back.id);
    return 'connected';
  end if;
  insert into public.intro_requests (from_id, to_id, event_id) values (me, p_to, p_event) on conflict do nothing;
  return 'requested';
end $$;

-- Accepting a request from an event makes a "met" connection; other requests stay intros.
create or replace function public.respond_request(p_request uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare req public.intro_requests;
begin
  select * into req from public.intro_requests where id = p_request for update;
  if not found or req.to_id <> auth.uid() then raise exception 'not your request'; end if;
  if req.status <> 'pending' then raise exception 'already answered'; end if;
  update public.intro_requests
     set status = case when p_accept then 'accepted'::public.request_status else 'declined' end,
         decided_at = now()
   where id = p_request;
  if p_accept and req.event_id is not null then
    perform public.connect_at_event(req.from_id, req.to_id, req.event_id, req.id);
  elsif p_accept then
    perform public.connect_pair(req.from_id, req.to_id, 'intro', null, req.id);
  end if;
end $$;

-- Requests now say which event they came from (no mutuals then).
drop function if exists public.incoming_requests();
create function public.incoming_requests()
returns table (id uuid, from_id uuid, created_at timestamptz, fires bigint, mutuals uuid[], event_id uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.from_id, r.created_at,
         count(*) filter (where rm.backed) as fires,
         array_remove(array_agg(rm.mutual_id), null) as mutuals,
         r.event_id
  from public.intro_requests r
  left join public.request_mutuals rm on rm.request_id = r.id
  where r.to_id = auth.uid() and r.status = 'pending'
  group by r.id
  order by fires desc, r.created_at desc;
$$;

drop function if exists public.outgoing_requests();
create function public.outgoing_requests()
returns table (id uuid, to_id uuid, created_at timestamptz, fires bigint, mutuals uuid[], event_id uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.to_id, r.created_at,
         count(*) filter (where rm.backed),
         array_remove(array_agg(rm.mutual_id), null),
         r.event_id
  from public.intro_requests r
  left join public.request_mutuals rm on rm.request_id = r.id
  where r.from_id = auth.uid() and r.status = 'pending'
  group by r.id
  order by r.created_at desc;
$$;

-- 5. Feed: event announcements and connections made at events --------------------------------------
-- New kinds: 'event' (id = event id, actor = host, fires = people going, fired = I'm going)
-- and 'event_met' (body = event id).
create or replace function public.feed(p_limit int default 60)
returns table (kind text, id text, at timestamptz, actor_id uuid, subject_id uuid, body text, selfie_path text, fires bigint, fired boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id from public.profiles p where p.id = auth.uid() and p.status = 'active'
  ),
  circle as (
    select id from me
    union
    select e.dst from public.edges e join me on e.src = me.id
  ),
  open_circle as (
    select c.id from circle c join public.profiles p on p.id = c.id
    where c.id in (select id from me) or p.open_to_network
  ),
  links as (
    select c.*,
           coalesce(i.inviter_id, r.from_id, c.user_a) as actor,
           case when i.flagged_at is null then i.selfie_path end as selfie_path
    from public.connections c
    left join public.invites i on i.id = c.invite_id
    left join public.intro_requests r on r.id = c.request_id
    where (c.user_a in (select id from circle) and c.user_b in (select id from circle))
       or c.user_a in (select id from open_circle)
       or c.user_b in (select id from open_circle)
  )
  select * from (
    select case when l.invite_id is null and l.event_id is not null then 'event_met'
                when l.kind = 'met' then 'handshake' else 'intro' end,
           coalesce(l.invite_id::text, l.user_a::text || ':' || l.user_b::text),
           l.created_at,
           l.actor,
           case when l.actor = l.user_a then l.user_b else l.user_a end,
           case when l.invite_id is null then l.event_id::text end,
           l.selfie_path, 0::bigint, false
    from links l
    where not exists (select 1 from public.profiles p where p.id in (l.user_a, l.user_b) and p.status = 'banned')
    union all
    select 'post', w.id::text, w.created_at, w.author_id, w.wall_owner_id, w.body, null::text,
           (select count(*) from public.post_fires f where f.post_id = w.id),
           exists (select 1 from public.post_fires f where f.post_id = w.id and f.profile_id = auth.uid())
    from public.wall_posts w
    where w.deleted_at is null
      and (w.wall_owner_id in (select id from circle) or w.author_id in (select id from circle))
    union all
    select 'event', ev.id::text, ev.created_at, ev.host_id, ev.host_id, null::text, null::text,
           (select count(*) from public.event_people x where x.event_id = ev.id and (x.going_at is not null or x.checked_in_at is not null)),
           exists (select 1 from public.event_people x where x.event_id = ev.id and x.user_id = auth.uid() and x.going_at is not null)
    from public.events ev
    where exists (select 1 from me)
      and (ev.review = 'approved' or (ev.review = 'pending' and ev.host_id in (select id from circle)))
      and not exists (select 1 from public.profiles p where p.id = ev.host_id and p.status = 'banned')
  ) events
  order by 3 desc
  limit greatest(1, least(p_limit, 200));
$$;

-- 6. Public calendar (the site and the public event page) -----------------------------------------
create or replace function public.events_public(p_from timestamptz default null, p_to timestamptz default null,
                                                p_slug text default null, p_limit int default 200)
returns table (id uuid, slug text, title text, body_md text, cover_path text, starts_at timestamptz, ends_at timestamptz,
               timezone text, online boolean, venue text, address text, city text, country text, price text,
               registration_url text, cancelled boolean, going int, here int, host_name text, host_handle text,
               updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.slug, e.title, e.body_md, e.cover_path, e.starts_at, e.ends_at, e.timezone, e.online, e.venue, e.address,
         c.name, c.country, e.price, e.registration_url, e.cancelled_at is not null,
         (select count(*)::int from public.event_people x where x.event_id = e.id and (x.going_at is not null or x.checked_in_at is not null)),
         (select count(*)::int from public.event_people x where x.event_id = e.id and x.checked_in_at is not null),
         h.name, h.handle, e.updated_at
  from public.events e
  join public.profiles h on h.id = e.host_id and h.status = 'active'
  left join public.cities c on c.id = e.city_id
  where e.review = 'approved'
    and (p_slug is null or e.slug = p_slug)
    and (p_slug is not null or coalesce(e.ends_at, e.starts_at + interval '8 hours') >= coalesce(p_from, now() - interval '1 day'))
    and (p_to is null or e.starts_at <= p_to)
  order by e.starts_at
  limit greatest(1, least(p_limit, 500));
$$;

-- 7. Ghost and export know about events -------------------------------------------------------------
create or replace function public.become_ghost()
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set handle = null, name = null, role = null, bio_md = '', avatar_path = null, links = '{}'::jsonb,
         city_id = null, birth_date = null, open_to_hiring = false, open_to_network = false,
         status = 'ghost', deleted_at = now()
   where id = auth.uid();
  delete from public.needs_offers  where profile_id = auth.uid();
  delete from public.profile_spheres where profile_id = auth.uid();
  delete from public.wall_posts where author_id = auth.uid() or wall_owner_id = auth.uid();
  delete from public.post_fires where profile_id = auth.uid();
  delete from public.hidden where profile_id = auth.uid();
  delete from public.match_cache where profile_id = auth.uid();
  delete from public.push_subscriptions where profile_id = auth.uid();
  delete from public.event_people where user_id = auth.uid();
  update public.events set cancelled_at = coalesce(cancelled_at, now())
   where host_id = auth.uid() and coalesce(ends_at, starts_at) > now();
  update public.invites set selfie_path = null where inviter_id = auth.uid();
  update public.invites set status = 'cancelled' where inviter_id = auth.uid() and status in ('live', 'scanned');
  update public.intro_requests set status = 'declined', decided_at = now()
   where status = 'pending' and (from_id = auth.uid() or to_id = auth.uid());
$$;

create or replace function public.my_export()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'city', (select jsonb_build_object('name', c.name, 'country', c.country)
             from public.profiles p join public.cities c on c.id = p.city_id where p.id = auth.uid()),
    'spheres', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'main', ps.is_primary)), '[]'::jsonb)
                from public.profile_spheres ps join public.spheres s on s.id = ps.sphere_id where ps.profile_id = auth.uid()),
    'needs_and_offers', (select coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'text', n.body, 'at', n.created_at)), '[]'::jsonb)
                         from public.needs_offers n where n.profile_id = auth.uid()),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'handle', o.handle, 'kind', c.kind, 'since', c.created_at)), '[]'::jsonb)
                    from public.connections c
                    join public.profiles o on o.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
                    where auth.uid() in (c.user_a, c.user_b)),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('status', i.status, 'at', i.created_at, 'joined', j.handle)), '[]'::jsonb)
                from public.invites i left join public.profiles j on j.id = i.joined_user_id where i.inviter_id = auth.uid()),
    'intro_requests', (select coalesce(jsonb_agg(jsonb_build_object('from', f.handle, 'to', t.handle, 'status', r.status, 'at', r.created_at)), '[]'::jsonb)
                       from public.intro_requests r join public.profiles f on f.id = r.from_id join public.profiles t on t.id = r.to_id
                       where auth.uid() in (r.from_id, r.to_id)),
    'wall_posts', (select coalesce(jsonb_agg(jsonb_build_object('by', a.handle, 'on_wall_of', w2.handle, 'text', w.body, 'at', w.created_at)), '[]'::jsonb)
                   from public.wall_posts w join public.profiles a on a.id = w.author_id join public.profiles w2 on w2.id = w.wall_owner_id
                   where w.deleted_at is null and auth.uid() in (w.author_id, w.wall_owner_id)),
    'events_hosted', (select coalesce(jsonb_agg(jsonb_build_object('title', e.title, 'starts_at', e.starts_at, 'review', e.review)), '[]'::jsonb)
                      from public.events e where e.host_id = auth.uid()),
    'events_attended', (select coalesce(jsonb_agg(jsonb_build_object('title', e.title, 'going_at', x.going_at, 'checked_in_at', x.checked_in_at)), '[]'::jsonb)
                        from public.event_people x join public.events e on e.id = x.event_id where x.user_id = auth.uid())
  );
$$;

-- 8. Access -----------------------------------------------------------------------------------------
revoke execute on function public.save_event(uuid, jsonb), public.cancel_event(uuid), public.review_event(uuid, boolean),
  public.event_checkin_code(uuid), public.new_checkin_code(uuid), public.set_going(uuid, boolean),
  public.event_check_in(text), public.people_from_events(), public.request_event_connect(uuid, uuid),
  public.incoming_requests(), public.outgoing_requests(), public.event_slug(text)
  from public, anon;
grant execute on function public.save_event(uuid, jsonb), public.cancel_event(uuid), public.review_event(uuid, boolean),
  public.event_checkin_code(uuid), public.new_checkin_code(uuid), public.set_going(uuid, boolean),
  public.event_check_in(text), public.people_from_events(), public.request_event_connect(uuid, uuid),
  public.incoming_requests(), public.outgoing_requests()
  to authenticated;
grant execute on function public.can_see_event(uuid, text), public.event_by_code(text),
  public.events_public(timestamptz, timestamptz, text, int), public.checkin_state(public.events) to anon, authenticated;
grant select on public.events, public.event_people, public.intro_requests, public.connections, public.admins to service_role;

-- 9. Covers: a public bucket (the calendar on the site shows them), members upload into their folder.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('covers', 'covers', true)
    on conflict (id) do update set public = true;
    execute 'drop policy if exists "members upload covers" on storage.objects';
    execute 'create policy "members upload covers" on storage.objects for insert to authenticated
               with check (bucket_id = ''covers'' and (storage.foldername(name))[1] = auth.uid()::text)';
    execute 'drop policy if exists "members remove their covers" on storage.objects';
    execute 'create policy "members remove their covers" on storage.objects for delete to authenticated
               using (bucket_id = ''covers'' and (storage.foldername(name))[1] = auth.uid()::text)';
  end if;
end $$;
