-- Admin panel, stage 1 (2026-10-17): action log, member activity, stats, members, ban.
-- Everything here is for admins: every admin_* function starts with is_admin(), the new tables have
-- RLS on and no policies, so only these security definer functions read or write them.

-- 1. Action log ------------------------------------------------------------------------------------
-- Who did what to what, when and why. Every admin action writes a row; member views too.
create table if not exists public.admin_actions (
  id          bigint generated always as identity primary key,
  admin_id    uuid references public.profiles (id) on delete set null,
  action      text not null check (char_length(action) <= 60),       -- 'ban', 'unban', 'hide_post', 'view_member', …
  target_type text check (char_length(target_type) <= 30),           -- 'profile', 'post', 'offer', 'event', …
  target_id   text check (char_length(target_id) <= 80),
  reason      text check (char_length(reason) <= 1000),
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_type, target_id, created_at desc);
alter table public.admin_actions enable row level security;

-- Internal: called from the admin functions below, never by members.
create or replace function public.admin_log_action(p_action text, p_target_type text, p_target_id text,
                                                   p_reason text default null, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_actions (admin_id, action, target_type, target_id, reason, meta)
  values (auth.uid(), p_action, p_target_type, p_target_id, nullif(left(trim(p_reason), 1000), ''), coalesce(p_meta, '{}'::jsonb));
$$;
revoke all on function public.admin_log_action(text, text, text, text, jsonb) from public;

-- 2. Activity --------------------------------------------------------------------------------------
-- One row per member per day they opened the app (UTC days): DAU / WAU / MAU and retention by cohort.
-- last_seen_at keeps the latest visit for the members table. Members can't read either.
alter table public.profiles add column if not exists last_seen_at timestamptz;
create table if not exists public.activity_days (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  primary key (profile_id, day)
);
create index if not exists activity_days_day_idx on public.activity_days (day);
alter table public.activity_days enable row level security;

-- The app's proxy calls this at most once a day per device (cookie), so it costs one query a day.
create or replace function public.touch_activity()
returns void language sql security definer set search_path = public as $$
  insert into public.activity_days (profile_id, day)
  select id, (now() at time zone 'utc')::date from public.profiles where id = auth.uid() and status = 'active'
  on conflict do nothing;
  update public.profiles set last_seen_at = now() where id = auth.uid() and status = 'active';
$$;

-- 3. How a member joined ----------------------------------------------------------------------------
-- "At an event": the inviter had checked in at an approved event, and the invite was made within that
-- event's check-in window (3 hours before the start to 3 hours after the end). Returns the event.
create or replace function public.joined_at_event(p_profile uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.id
  from public.profiles p
  join public.invites i      on i.joined_user_id = p.id and i.inviter_id = p.invited_by and i.status = 'joined'
  join public.event_people ep on ep.user_id = i.inviter_id and ep.checked_in_at is not null
  join public.events e       on e.id = ep.event_id and e.review = 'approved' and e.cancelled_at is null
  where p.id = p_profile
    and i.created_at between e.starts_at - interval '3 hours'
                         and coalesce(e.ends_at, e.starts_at + interval '8 hours') + interval '3 hours'
  order by e.starts_at desc
  limit 1;
$$;
revoke all on function public.joined_at_event(uuid) from public;

create or replace function public.join_method(p_profile uuid, p_invited_by uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when p_invited_by is null then 'founder'
              when public.joined_at_event(p_profile) is not null then 'event'
              else 'selfie' end;
$$;
revoke all on function public.join_method(uuid, uuid) from public;

-- 4. Badges: what waits for a decision -------------------------------------------------------------
create or replace function public.admin_badges()
returns table (events bigint, reports bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query select
    (select count(*) from public.events e where e.review = 'pending' and e.cancelled_at is null),
    (select count(distinct coalesce(r.target_invite_id::text, r.target_post_id::text, r.target_profile_id::text))
       from public.reports r where r.resolved_at is null);
end $$;

-- 5. Overview numbers ------------------------------------------------------------------------------
-- Period figures count what happened between p_from and p_to (null = all time / now).
-- Totals, network and devices are a snapshot of now.
create or replace function public.admin_stats(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  t timestamptz := coalesce(p_to, now());
  today date := (now() at time zone 'utc')::date;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'north_star', jsonb_build_object(
      -- intros through mutuals (event connects have event_id and are counted under events)
      'accepted', (select count(*) from public.intro_requests r
                    where r.status = 'accepted' and r.event_id is null and r.decided_at >= f and r.decided_at < t),
      'last_7d',  (select count(*) from public.intro_requests r
                    where r.status = 'accepted' and r.event_id is null and r.decided_at >= now() - interval '7 days')),
    'funnel', (
      select jsonb_build_object(
        'created', count(*),
        'scanned', count(*) filter (where x.scanned_at is not null or x.status = 'joined'),
        'joined', count(*) filter (where x.newbie),
        'member_handshakes', count(*) filter (where x.status = 'joined' and not x.newbie))
      from (select i.status, i.scanned_at,
                   exists (select 1 from public.profiles p where p.id = i.joined_user_id and p.invited_by = i.inviter_id
                                                             and p.created_at >= i.created_at) as newbie
              from public.invites i where i.created_at >= f and i.created_at < t) x),
    'members', jsonb_build_object(
      'active', (select count(*) from public.profiles where status = 'active'),
      'ghost',  (select count(*) from public.profiles where status = 'ghost'),
      'banned', (select count(*) from public.profiles where status = 'banned'),
      'new',     (select count(*) from public.profiles where created_at >= f and created_at < t),
      'new_7d',  (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
      'new_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
      'by_city', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'country', x.country, 'n', x.n) order by x.n desc), '[]'::jsonb)
                    from (select c.name, c.country, count(*) n from public.profiles p join public.cities c on c.id = p.city_id
                           where p.status = 'active' group by c.id, c.name, c.country order by n desc limit 12) x),
      'by_sphere', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'n', x.n) order by x.n desc), '[]'::jsonb)
                    from (select coalesce(top.name, s.name) as name, count(*) n
                            from public.profile_spheres ps
                            join public.profiles p on p.id = ps.profile_id and p.status = 'active'
                            join public.spheres s on s.id = ps.sphere_id
                            left join public.spheres top on top.id = s.parent_id
                           where ps.is_primary group by 1 order by n desc limit 12) x)),
    'activity', jsonb_build_object(
      'dau', (select count(*) from public.activity_days where day = today),
      'wau', (select count(distinct profile_id) from public.activity_days where day > today - 7),
      'mau', (select count(distinct profile_id) from public.activity_days where day > today - 30),
      'connections', (select jsonb_build_object(
                        'met', count(*) filter (where c.kind = 'met' and c.event_id is null),
                        'intro', count(*) filter (where c.kind = 'intro'),
                        'event', count(*) filter (where c.event_id is not null))
                      from public.connections c where c.created_at >= f and c.created_at < t),
      'requests', (select jsonb_build_object(
                     'sent', count(*) filter (where r.created_at >= f and r.created_at < t),
                     'accepted', count(*) filter (where r.status = 'accepted' and r.decided_at >= f and r.decided_at < t),
                     'declined', count(*) filter (where r.status = 'declined' and r.decided_at >= f and r.decided_at < t))
                   from public.intro_requests r where r.event_id is null),
      'fires', (select count(*) from public.request_mutuals m where m.backed and m.backed_at >= f and m.backed_at < t),
      'post_fires', (select count(*) from public.post_fires pf where pf.created_at >= f and pf.created_at < t),
      'wall_posts', (select count(*) from public.wall_posts w where w.created_at >= f and w.created_at < t)),
    'events', (select jsonb_build_object(
                 'created', count(*),
                 'approved', count(*) filter (where e.review = 'approved'),
                 'pending', count(*) filter (where e.review = 'pending' and e.cancelled_at is null),
                 'going', (select count(*) from public.event_people ep where ep.going_at >= f and ep.going_at < t),
                 'checkins', (select count(*) from public.event_people ep where ep.checked_in_at >= f and ep.checked_in_at < t),
                 'connections', (select count(*) from public.connections c where c.event_id is not null and c.created_at >= f and c.created_at < t))
               from public.events e where e.created_at >= f and e.created_at < t),
    'offers', jsonb_build_object(
      'by_kind', (select coalesce(jsonb_object_agg(x.kind, jsonb_build_object('open', x.n_open, 'closed', x.n_closed)), '{}'::jsonb)
                    from (select o.kind, count(*) filter (where o.closed_at is null) as n_open, count(*) filter (where o.closed_at is not null) as n_closed
                            from public.offers o where o.created_at >= f and o.created_at < t group by o.kind) x),
      'interest', (select count(*) from public.offer_interest oi where oi.created_at >= f and oi.created_at < t)),
    'network', (
      with a as (select id, invited_by from public.profiles where status = 'active'),
      deg as (select a.id, a.invited_by,
                     (select count(*) from public.edges e join a q on q.id = e.dst where e.src = a.id) as d,
                     (select count(*) from public.edges e join a q on q.id = e.dst
                       where e.src = a.id and e.dst is distinct from a.invited_by) as beyond_inviter
                from a),
      tree as (
        with recursive t(id, depth) as (
          select id, 1 from public.profiles where invited_by is null
          union all
          select p.id, t.depth + 1 from public.profiles p join t on p.invited_by = t.id where t.depth < 1000)
        select max(depth) as depth from t)
      select jsonb_build_object(
        'members', count(*),
        'edges', coalesce(sum(d), 0) / 2,
        'avg_degree', round(coalesce(avg(d), 0), 2),
        'lonely', count(*) filter (where beyond_inviter = 0),
        'tree_depth', (select depth from tree))
      from deg),
    'push', (select jsonb_build_object('devices', count(*), 'members', count(distinct ps.profile_id)) from public.push_subscriptions ps)
  );
end $$;

-- Weekly series for the charts and the CSV. Weeks start on Monday, UTC. Missing weeks are zeros (filled by the app).
-- The invite funnel is keyed by the week the invite was made, so each week's conversion is consistent.
create or replace function public.admin_timeseries(p_from timestamptz default null, p_to timestamptz default null)
returns table (week date, metric text, value bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  f timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  t timestamptz := coalesce(p_to, now());
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  select x.w, x.m, x.n from (
    select date_trunc('week', i.created_at at time zone 'utc')::date w, 'invites_created'::text m, count(*) n
      from public.invites i where i.created_at >= f and i.created_at < t group by 1
    union all
    select date_trunc('week', i.created_at at time zone 'utc')::date, 'invites_scanned', count(*)
      from public.invites i where i.created_at >= f and i.created_at < t and (i.scanned_at is not null or i.status = 'joined') group by 1
    union all
    select date_trunc('week', i.created_at at time zone 'utc')::date, 'invites_joined', count(*)
      from public.invites i join public.profiles p on p.id = i.joined_user_id and p.invited_by = i.inviter_id and p.created_at >= i.created_at
     where i.created_at >= f and i.created_at < t group by 1
    union all
    select date_trunc('week', p.created_at at time zone 'utc')::date, 'members_new', count(*)
      from public.profiles p where p.created_at >= f and p.created_at < t group by 1
    union all
    select date_trunc('week', r.decided_at at time zone 'utc')::date, 'intros_accepted', count(*)
      from public.intro_requests r where r.status = 'accepted' and r.event_id is null and r.decided_at >= f and r.decided_at < t group by 1
    union all
    select date_trunc('week', r.decided_at at time zone 'utc')::date, 'intros_declined', count(*)
      from public.intro_requests r where r.status = 'declined' and r.event_id is null and r.decided_at >= f and r.decided_at < t group by 1
    union all
    select date_trunc('week', r.created_at at time zone 'utc')::date, 'intros_sent', count(*)
      from public.intro_requests r where r.event_id is null and r.created_at >= f and r.created_at < t group by 1
    union all
    select date_trunc('week', c.created_at at time zone 'utc')::date,
           case when c.event_id is not null then 'connections_event' when c.kind = 'met' then 'connections_met' else 'connections_intro' end,
           count(*)
      from public.connections c where c.created_at >= f and c.created_at < t group by 1, 2
    union all
    select date_trunc('week', m.backed_at at time zone 'utc')::date, 'fires', count(*)
      from public.request_mutuals m where m.backed and m.backed_at >= f and m.backed_at < t group by 1
    union all
    select date_trunc('week', pf.created_at at time zone 'utc')::date, 'post_fires', count(*)
      from public.post_fires pf where pf.created_at >= f and pf.created_at < t group by 1
    union all
    select date_trunc('week', w.created_at at time zone 'utc')::date, 'wall_posts', count(*)
      from public.wall_posts w where w.created_at >= f and w.created_at < t group by 1
    union all
    select date_trunc('week', e.created_at at time zone 'utc')::date, 'events_created', count(*)
      from public.events e where e.created_at >= f and e.created_at < t group by 1
    union all
    select date_trunc('week', ep.checked_in_at at time zone 'utc')::date, 'checkins', count(*)
      from public.event_people ep where ep.checked_in_at >= f and ep.checked_in_at < t group by 1
    union all
    select date_trunc('week', o.created_at at time zone 'utc')::date, 'offers_created', count(*)
      from public.offers o where o.created_at >= f and o.created_at < t group by 1
    union all
    select date_trunc('week', oi.created_at at time zone 'utc')::date, 'offer_interest', count(*)
      from public.offer_interest oi where oi.created_at >= f and oi.created_at < t group by 1
    union all
    select date_trunc('week', a.day::timestamp)::date, 'active_members', count(distinct a.profile_id)
      from public.activity_days a where a.day >= (f at time zone 'utc')::date and a.day <= (t at time zone 'utc')::date group by 1
  ) x
  order by 1, 2;
end $$;

-- Weekly retention: members who joined in a week (cohort) and were active N weeks later.
create or replace function public.admin_retention(p_weeks int default 12)
returns table (cohort date, size bigint, week_n int, active bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  with c as (
    select p.id, date_trunc('week', p.created_at at time zone 'utc')::date as cohort
      from public.profiles p
     where p.created_at >= date_trunc('week', now() at time zone 'utc') - make_interval(weeks => greatest(1, least(p_weeks, 52)))
  ),
  sizes as (select c.cohort, count(*) n from c group by c.cohort)
  select s.cohort, s.n, x.week_n, x.active
    from sizes s
    left join lateral (
      select ((date_trunc('week', a.day::timestamp)::date - c.cohort) / 7)::int as week_n, count(distinct a.profile_id) as active
        from c join public.activity_days a on a.profile_id = c.id
       where c.cohort = s.cohort
       group by 1) x on true
   order by 1, 3;
end $$;

-- 6. Members ---------------------------------------------------------------------------------------
-- The members table. Never returns birth dates or emails.
create or replace function public.admin_members(
  p_q text default null, p_city int default null, p_sphere int default null, p_status text default null,
  p_join text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, handle text, name text, role text, avatar_path text, city_id int, city text, sphere text,
               status public.profile_status, created_at timestamptz, last_seen_at timestamptz,
               invited_by uuid, inviter_name text, join_method text, connections bigint, invited bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  q text := nullif(trim(p_q), '');
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if q is not null then q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  return query
  with m as (
    select p.*, public.join_method(p.id, p.invited_by) as jm
      from public.profiles p
     where (q is null or p.name ilike q or p.handle ilike q)
       and (p_city is null or p.city_id = p_city)
       and (p_sphere is null or exists (
             select 1 from public.profile_spheres ps join public.spheres s on s.id = ps.sphere_id
              where ps.profile_id = p.id and (s.id = p_sphere or s.parent_id = p_sphere)))
       and (p_status is null or p.status::text = p_status)
       and (p_from is null or p.created_at >= p_from)
       and (p_to is null or p.created_at < p_to)
  ),
  f as (select * from m where p_join is null or m.jm = p_join)
  select f.id, f.handle, f.name, f.role, f.avatar_path, f.city_id, c.name,
         (select s.name from public.profile_spheres ps join public.spheres s on s.id = ps.sphere_id
           where ps.profile_id = f.id order by ps.is_primary desc, s.name limit 1),
         f.status, f.created_at, f.last_seen_at, f.invited_by, inv.name, f.jm,
         (select count(*) from public.edges e where e.src = f.id),
         (select count(*) from public.profiles x where x.invited_by = f.id),
         count(*) over ()
    from f
    left join public.cities c on c.id = f.city_id
    left join public.profiles inv on inv.id = f.invited_by
   order by f.created_at desc, f.id
   limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- A member's card for the side panel. Each opening is logged (once per admin per member per 10 minutes).
create or replace function public.admin_member(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  ev uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into p from public.profiles where id = p_id;
  if not found then raise exception 'member not found'; end if;
  if not exists (select 1 from public.admin_actions a where a.admin_id = auth.uid() and a.action = 'view_member'
                    and a.target_id = p_id::text and a.created_at > now() - interval '10 minutes') then
    perform public.admin_log_action('view_member', 'profile', p_id::text);
  end if;
  ev := public.joined_at_event(p_id);

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'handle', p.handle, 'name', p.name, 'role', p.role, 'bio_md', p.bio_md, 'avatar_path', p.avatar_path,
      'status', p.status, 'created_at', p.created_at, 'last_seen_at', p.last_seen_at, 'deleted_at', p.deleted_at,
      'links', p.links, 'open_to_hiring', p.open_to_hiring, 'open_to_network', p.open_to_network,
      'is_admin', exists (select 1 from public.admins a where a.profile_id = p.id),
      'city', (select jsonb_build_object('id', c.id, 'name', c.name, 'country', c.country) from public.cities c where c.id = p.city_id),
      'spheres', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'primary', ps.is_primary)
                                           order by ps.is_primary desc, s.name), '[]'::jsonb)
                    from public.profile_spheres ps join public.spheres s on s.id = ps.sphere_id where ps.profile_id = p.id),
      'active_days_30', (select count(*) from public.activity_days a where a.profile_id = p.id
                           and a.day > (now() at time zone 'utc')::date - 30)),
    'join', jsonb_build_object(
      'method', public.join_method(p.id, p.invited_by),
      'event', (select jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'starts_at', e.starts_at)
                  from public.events e where e.id = ev),
      'invite', (select jsonb_build_object('id', i.id, 'created_at', i.created_at, 'selfie_path', i.selfie_path)
                   from public.invites i where i.joined_user_id = p.id and i.inviter_id = p.invited_by and i.status = 'joined'
                  order by i.created_at limit 1)),
    -- up the tree: inviter, their inviter, … to a founder
    'ancestors', (
      with recursive up(id, depth) as (
        select p.invited_by, 1 where p.invited_by is not null
        union all
        select q.invited_by, up.depth + 1 from up join public.profiles q on q.id = up.id
         where q.invited_by is not null and up.depth < 100)
      select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'handle', q.handle, 'name', q.name, 'avatar_path', q.avatar_path,
                                                   'status', q.status, 'depth', up.depth) order by up.depth), '[]'::jsonb)
        from up join public.profiles q on q.id = up.id),
    -- down the tree: everyone this member brought in, and whom they brought in
    'invitees', (
      with recursive down(id, parent, depth) as (
        select q.id, q.invited_by, 1 from public.profiles q where q.invited_by = p.id
        union all
        select q.id, q.invited_by, down.depth + 1 from public.profiles q join down on q.invited_by = down.id where down.depth < 20)
      select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'parent', d.parent, 'depth', d.depth, 'handle', q.handle, 'name', q.name,
                                                   'avatar_path', q.avatar_path, 'status', q.status, 'created_at', q.created_at)
                                order by d.depth, q.created_at), '[]'::jsonb)
        from (select * from down limit 300) d join public.profiles q on q.id = d.id),
    'connections', (
      select jsonb_build_object(
        'met', count(*) filter (where x.kind = 'met' and x.event_id is null),
        'intro', count(*) filter (where x.kind = 'intro'),
        'event', count(*) filter (where x.event_id is not null),
        'list', coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'handle', x.handle, 'name', x.name, 'avatar_path', x.avatar_path,
                                                      'status', x.status, 'kind', x.kind, 'event_id', x.event_id, 'created_at', x.created_at)
                                   order by x.created_at desc) filter (where x.rn <= 100), '[]'::jsonb))
      from (select q.id, q.handle, q.name, q.avatar_path, q.status, c.kind, c.event_id, c.created_at,
                   row_number() over (order by c.created_at desc) rn
              from public.connections c
              join public.profiles q on q.id = case when c.user_a = p.id then c.user_b else c.user_a end
             where p.id in (c.user_a, c.user_b)) x),
    'events', jsonb_build_object(
      'hosted', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'starts_at', e.starts_at,
                                                              'review', e.review, 'cancelled_at', e.cancelled_at) order by e.starts_at desc), '[]'::jsonb)
                   from public.events e where e.host_id = p.id),
      'attended', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'starts_at', e.starts_at,
                                                                'going_at', ep.going_at, 'checked_in_at', ep.checked_in_at) order by e.starts_at desc), '[]'::jsonb)
                     from public.event_people ep join public.events e on e.id = ep.event_id
                    where ep.user_id = p.id and e.host_id <> p.id)),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'title', o.title, 'price', o.price,
                                                            'closed_at', o.closed_at, 'created_at', o.created_at,
                                                            'interest', (select count(*) from public.offer_interest oi where oi.offer_id = o.id))
                                         order by o.closed_at nulls first, o.created_at desc), '[]'::jsonb)
                 from public.offers o where o.profile_id = p.id),
    'posts', (select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) from (
                select w.created_at, jsonb_build_object('id', w.id, 'body', w.body, 'created_at', w.created_at,
                         'wall_owner', jsonb_build_object('id', o.id, 'handle', o.handle, 'name', o.name),
                         'fires', (select count(*) from public.post_fires pf where pf.post_id = w.id)) j
                  from public.wall_posts w join public.profiles o on o.id = w.wall_owner_id
                 where w.author_id = p.id and w.deleted_at is null
                 order by w.created_at desc limit 30) x),
    'reports_against', (select coalesce(jsonb_agg(jsonb_build_object(
                           'id', r.id, 'reason', r.reason, 'created_at', r.created_at, 'resolved_at', r.resolved_at,
                           'about', case when r.target_invite_id is not null then 'handshake'
                                         when r.target_post_id is not null then 'post' else 'member' end,
                           'reporter', jsonb_build_object('id', q.id, 'handle', q.handle, 'name', q.name)) order by r.created_at desc), '[]'::jsonb)
                          from public.reports r join public.profiles q on q.id = r.reporter_id
                         where r.target_profile_id = p.id
                            or r.target_post_id in (select w.id from public.wall_posts w where w.author_id = p.id)
                            or r.target_invite_id in (select i.id from public.invites i where p.id in (i.inviter_id, i.joined_user_id))),
    'reports_by', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', r.id, 'reason', r.reason, 'created_at', r.created_at, 'resolved_at', r.resolved_at,
                      'about', case when r.target_invite_id is not null then 'handshake'
                                    when r.target_post_id is not null then 'post' else 'member' end) order by r.created_at desc), '[]'::jsonb)
                     from public.reports r where r.reporter_id = p.id),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason, 'created_at', a.created_at,
                                                             'admin', (select q.name from public.profiles q where q.id = a.admin_id))
                                          order by a.created_at desc), '[]'::jsonb)
                  from (select * from public.admin_actions a where a.target_type = 'profile' and a.target_id = p.id::text
                           and a.action <> 'view_member' order by a.created_at desc limit 30) a)
  );
end $$;

-- Ban and unban. Ghosts and admins are out of reach; a reason is required to ban.
-- The server also blocks the account in Supabase Auth, so a banned member's session stops refreshing.
create or replace function public.admin_set_ban(p_profile uuid, p_ban boolean, p_reason text default null)
returns public.profile_status language plpgsql security definer set search_path = public as $$
declare
  s public.profile_status;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_profile = auth.uid() then raise exception 'not yourself'; end if;
  if exists (select 1 from public.admins a where a.profile_id = p_profile) then raise exception 'cannot ban an admin'; end if;
  if p_ban and nullif(trim(p_reason), '') is null then raise exception 'reason required'; end if;
  update public.profiles set status = case when p_ban then 'banned'::public.profile_status else 'active'::public.profile_status end
   where id = p_profile and status = case when p_ban then 'active'::public.profile_status else 'banned'::public.profile_status end
  returning status into s;
  if not found then raise exception 'nothing to change'; end if;
  perform public.admin_log_action(case when p_ban then 'ban' else 'unban' end, 'profile', p_profile::text, p_reason);
  return s;
end $$;

-- Hide a wall post (it stays in the database, deleted_at set) and close an offer, from the member card.
create or replace function public.admin_hide_post(p_post uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  author uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.wall_posts set deleted_at = now() where id = p_post and deleted_at is null returning author_id into author;
  if not found then raise exception 'post not found'; end if;
  perform public.admin_log_action('hide_post', 'profile', author::text, p_reason, jsonb_build_object('post_id', p_post));
end $$;

create or replace function public.admin_close_offer(p_offer uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  author uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.offers set closed_at = now(), updated_at = now() where id = p_offer and closed_at is null returning profile_id into author;
  if not found then raise exception 'offer not found or already closed'; end if;
  perform public.admin_log_action('close_offer', 'profile', author::text, p_reason, jsonb_build_object('offer_id', p_offer));
end $$;

-- 7. Access --------------------------------------------------------------------------------------
revoke execute on function public.touch_activity(), public.admin_badges(), public.admin_stats(timestamptz, timestamptz),
  public.admin_timeseries(timestamptz, timestamptz), public.admin_retention(int),
  public.admin_members(text, int, int, text, text, timestamptz, timestamptz, int, int), public.admin_member(uuid),
  public.admin_set_ban(uuid, boolean, text), public.admin_hide_post(uuid, text), public.admin_close_offer(uuid, text)
  from public, anon;
grant execute on function public.touch_activity(), public.admin_badges(), public.admin_stats(timestamptz, timestamptz),
  public.admin_timeseries(timestamptz, timestamptz), public.admin_retention(int),
  public.admin_members(text, int, int, text, text, timestamptz, timestamptz, int, int), public.admin_member(uuid),
  public.admin_set_ban(uuid, boolean, text), public.admin_hide_post(uuid, text), public.admin_close_offer(uuid, text)
  to authenticated;
