-- 1. Cities for the whole world: same name can exist in several countries; population ranks search.
-- 2. More digital professions in spheres.
-- 3. Fake handshakes: members report them, 3 reports hide the selfie and queue it for an admin,
--    an admin keeps or cancels the connection; the two people can remove their connection any time.

-- 1. Cities ---------------------------------------------------------------------------------
alter table public.cities add column if not exists population int not null default 0;
alter table public.cities drop constraint if exists cities_name_key;
alter table public.cities add constraint cities_name_country_key unique (name, country);
update public.cities set country = 'United Arab Emirates' where country = 'UAE';
update public.cities set country = 'United Kingdom' where country = 'UK';
update public.cities set country = 'United States' where country = 'USA';
update public.cities set country = 'Hong Kong' where name = 'Hong Kong';
update public.cities set population = 1350000 where name = 'Astana' and population = 0;
update public.cities set population = 900000 where name = 'Bali' and population = 0;
create index if not exists cities_name_search on public.cities (lower(name) text_pattern_ops);
-- The world list itself is in supabase/seed_cities.sql (8 953 cities with 50 000+ people).

-- 2. Spheres --------------------------------------------------------------------------------
insert into public.spheres (parent_id, name)
select null, v.name from (values ('Engineering'), ('AI & Data'), ('Product'), ('Design'), ('Marketing'), ('Sales & BD'),
  ('Business'), ('People'), ('Creators & Media')) as v(name)
on conflict do nothing;
insert into public.spheres (parent_id, name)
select p.id, v.name
from (values
  ('Engineering', 'iOS'), ('Engineering', 'Android'), ('Engineering', 'Embedded'), ('Engineering', 'SRE'),
  ('Engineering', 'Platform Engineering'), ('Engineering', 'Engineering Management'), ('Engineering', 'Solutions Architecture'),
  ('Engineering', 'AR / VR'), ('Engineering', 'Low-code / No-code'), ('Engineering', 'CTO'),
  ('AI & Data', 'ML Engineering'), ('AI & Data', 'MLOps'), ('AI & Data', 'LLM / GenAI'), ('AI & Data', 'Computer Vision'),
  ('AI & Data', 'NLP'), ('AI & Data', 'BI'), ('AI & Data', 'AI Research'), ('AI & Data', 'Prompt Engineering'),
  ('Product', 'Product Owner'), ('Product', 'Product Ops'), ('Product', 'Growth PM'), ('Product', 'Agile / Scrum'), ('Product', 'CPO'),
  ('Design', 'UX Writing'), ('Design', 'Design Systems'), ('Design', 'Game Design'), ('Design', 'Illustration'),
  ('Design', 'Web Design'), ('Design', 'Art & Creative Direction'),
  ('Marketing', 'Product Marketing'), ('Marketing', 'Email & CRM'), ('Marketing', 'Influencer Marketing'),
  ('Marketing', 'Brand Marketing'), ('Marketing', 'Paid Ads'), ('Marketing', 'Marketing Analytics'), ('Marketing', 'CMO'),
  ('Sales & BD', 'Account Management'), ('Sales & BD', 'Customer Success'), ('Sales & BD', 'Sales Engineering'),
  ('Sales & BD', 'Developer Relations'),
  ('Business', 'COO'), ('Business', 'Strategy'), ('Business', 'Consulting'), ('Business', 'Fintech'), ('Business', 'E-commerce'),
  ('People', 'Tech Recruiting'), ('People', 'People Ops'), ('People', 'Learning & Development'), ('People', 'Mentoring'),
  ('Creators & Media', 'Content Creator'), ('Creators & Media', 'Video & YouTube'), ('Creators & Media', 'Podcasting'),
  ('Creators & Media', 'Streaming'), ('Creators & Media', 'Newsletter & Writing'), ('Creators & Media', 'Music & Audio'),
  ('Creators & Media', 'Photography')
) as v(parent, name)
join public.spheres p on p.name = v.parent and p.parent_id is null
on conflict do nothing;

-- 3. Fake handshakes ----------------------------------------------------------------------------
create table if not exists public.admins (profile_id uuid primary key references public.profiles (id) on delete cascade);
alter table public.admins enable row level security; -- no policies: only security definer functions read it

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where profile_id = auth.uid());
$$;

alter table public.invites add column if not exists flagged_at timestamptz;
alter table public.reports add column if not exists target_invite_id uuid references public.invites (id) on delete cascade;
alter table public.reports drop constraint if exists reports_check;
alter table public.reports add constraint reports_target check (target_profile_id is not null or target_post_id is not null or target_invite_id is not null);
create unique index if not exists reports_one_per_handshake on public.reports (reporter_id, target_invite_id) where target_invite_id is not null;

-- A member reports a handshake selfie as fake. Three different members hide it and queue it for an admin.
create or replace function public.report_handshake(p_invite uuid, p_reason text default 'fake handshake')
returns int language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null or not exists (select 1 from public.profiles where id = me and status = 'active') then
    raise exception 'not a member';
  end if;
  if not exists (select 1 from public.connections where invite_id = p_invite) then raise exception 'handshake not found'; end if;
  insert into public.reports (reporter_id, target_invite_id, reason)
  values (me, p_invite, left(coalesce(nullif(trim(p_reason), ''), 'fake handshake'), 1000))
  on conflict do nothing;
  select count(distinct reporter_id) into n from public.reports where target_invite_id = p_invite and resolved_at is null;
  if n >= 3 then
    update public.invites set flagged_at = coalesce(flagged_at, now()) where id = p_invite;
  end if;
  return n;
end $$;

-- Either of the two people removes their connection.
create or replace function public.remove_connection(p_other uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.connections
  where user_a = least(auth.uid(), p_other) and user_b = greatest(auth.uid(), p_other);
$$;

-- Meeting in person after an intro upgrades the connection to "met" (before, the handshake was silently dropped).
create or replace function public.connect_pair(a uuid, b uuid, k public.connection_kind, inv uuid, req uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.connections (user_a, user_b, kind, invite_id, request_id)
  values (least(a, b), greatest(a, b), k, inv, req)
  on conflict (user_a, user_b) do update
    set kind = 'met', invite_id = excluded.invite_id, created_at = now()
    where excluded.kind = 'met' and public.connections.kind = 'intro';
$$;
revoke all on function public.connect_pair(uuid, uuid, public.connection_kind, uuid, uuid) from public;

-- Admin queue: handshakes with open reports, flagged ones first.
create or replace function public.admin_flags()
returns table (invite_id uuid, inviter_id uuid, guest_id uuid, selfie_path text, met_at timestamptz,
               reports bigint, reasons text[], flagged_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.inviter_id, coalesce(i.joined_user_id, case when c.user_a = i.inviter_id then c.user_b else c.user_a end),
         i.selfie_path, c.created_at, count(distinct r.reporter_id), array_agg(distinct r.reason), i.flagged_at
  from public.reports r
  join public.invites i on i.id = r.target_invite_id
  join public.connections c on c.invite_id = i.id
  where r.resolved_at is null and public.is_admin()
  group by i.id, c.user_a, c.user_b, c.created_at
  order by i.flagged_at nulls last, count(distinct r.reporter_id) desc;
$$;

-- Admin decision: keep the handshake (reports closed, selfie back) or cancel the connection.
create or replace function public.admin_resolve_handshake(p_invite uuid, p_cancel boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_cancel then
    -- a handshake on top of an intro falls back to the intro; a pure handshake goes away
    update public.connections set kind = 'intro', invite_id = null where invite_id = p_invite and request_id is not null;
    delete from public.connections where invite_id = p_invite;
  else
    update public.invites set flagged_at = null where id = p_invite;
  end if;
  update public.reports set resolved_at = now() where target_invite_id = p_invite and resolved_at is null;
end $$;

-- Hidden selfies stay hidden on walls and in the feed (same functions as before, selfie masked when flagged).
create or replace function public.wall(p_profile uuid)
returns table (kind text, id uuid, at timestamptz, author_id uuid, other_id uuid, body text, selfie_path text, fires bigint, fired boolean)
language sql stable security definer set search_path = public as $$
  with viewer as (
    select 1 from public.profiles me where me.id = auth.uid() and me.status = 'active'
  )
  select 'handshake', i.id, c.created_at, i.inviter_id,
         case when c.user_a = p_profile then c.user_b else c.user_a end,
         null::text, case when i.flagged_at is null then i.selfie_path end, 0::bigint, false
  from public.connections c
  join public.invites i on i.id = c.invite_id
  where (c.user_a = p_profile or c.user_b = p_profile) and c.kind = 'met' and exists (select 1 from viewer)
  union all
  select 'post', w.id, w.created_at, w.author_id, null::uuid, w.body, null::text,
         (select count(*) from public.post_fires f where f.post_id = w.id),
         exists (select 1 from public.post_fires f where f.post_id = w.id and f.profile_id = auth.uid())
  from public.wall_posts w
  where w.wall_owner_id = p_profile and w.deleted_at is null and exists (select 1 from viewer)
  order by 3 desc;
$$;

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
    select case when l.kind = 'met' then 'handshake' else 'intro' end,
           coalesce(l.invite_id::text, l.user_a::text || ':' || l.user_b::text),
           l.created_at,
           l.actor,
           case when l.actor = l.user_a then l.user_b else l.user_a end,
           null::text, l.selfie_path, 0::bigint, false
    from links l
    where not exists (select 1 from public.profiles p where p.id in (l.user_a, l.user_b) and p.status = 'banned')
    union all
    select 'post', w.id::text, w.created_at, w.author_id, w.wall_owner_id, w.body, null::text,
           (select count(*) from public.post_fires f where f.post_id = w.id),
           exists (select 1 from public.post_fires f where f.post_id = w.id and f.profile_id = auth.uid())
    from public.wall_posts w
    where w.deleted_at is null
      and (w.wall_owner_id in (select id from circle) or w.author_id in (select id from circle))
  ) events
  order by 3 desc
  limit greatest(1, least(p_limit, 200));
$$;

revoke execute on function public.is_admin(), public.report_handshake(uuid, text), public.remove_connection(uuid),
  public.admin_flags(), public.admin_resolve_handshake(uuid, boolean) from public, anon;
grant execute on function public.is_admin(), public.report_handshake(uuid, text), public.remove_connection(uuid),
  public.admin_flags(), public.admin_resolve_handshake(uuid, boolean) to authenticated;
