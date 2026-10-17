-- Offers instead of "i need / i can" (Nik, 2026-10-17).
-- "i can" is what the card's bio already says, so it goes. "i need" becomes offer cards: members put out
-- orders, projects, products and services. Offers are public (on the card, indexed); members say
-- "i'm interested", the author sees who. New offers show up in the feed of the author's circle.
-- Existing "i need" lines become orders; "i can" lines are removed. AI matching on needs is gone with them.

-- 1. Offers ---------------------------------------------------------------------------------------
create table if not exists public.offers (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('order', 'project', 'product', 'service')),
  title      text not null check (char_length(title) between 3 and 120),
  body_md    text not null default '' check (char_length(body_md) <= 2000),
  price      text check (char_length(price) <= 40),
  link       text check (link ~ '^https://' and char_length(link) <= 500),
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offers_profile_idx on public.offers (profile_id, created_at desc);

create table if not exists public.offer_interest (
  offer_id   uuid not null references public.offers (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (offer_id, profile_id)
);
create index if not exists offer_interest_profile_idx on public.offer_interest (profile_id);

create or replace function public.is_active_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p and status = 'active');
$$;

alter table public.offers enable row level security;
alter table public.offer_interest enable row level security;

drop policy if exists "offers are public" on public.offers;
create policy "offers are public" on public.offers for select using (public.is_active_member(profile_id));
drop policy if exists "members post offers" on public.offers;
create policy "members post offers" on public.offers for insert to authenticated
  with check (profile_id = auth.uid() and public.is_active_member(auth.uid()));
drop policy if exists "authors edit offers" on public.offers;
create policy "authors edit offers" on public.offers for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "authors delete offers" on public.offers;
create policy "authors delete offers" on public.offers for delete to authenticated using (profile_id = auth.uid());

-- Interest: I see mine; the author sees who is interested in their offers.
drop policy if exists "interest visible to both" on public.offer_interest;
create policy "interest visible to both" on public.offer_interest for select to authenticated using (
  profile_id = auth.uid() or exists (select 1 from public.offers o where o.id = offer_id and o.profile_id = auth.uid())
);
drop policy if exists "members show interest" on public.offer_interest;
create policy "members show interest" on public.offer_interest for insert to authenticated with check (
  profile_id = auth.uid() and public.is_active_member(auth.uid())
  and exists (select 1 from public.offers o where o.id = offer_id and o.closed_at is null and o.profile_id <> auth.uid())
);
drop policy if exists "members take interest back" on public.offer_interest;
create policy "members take interest back" on public.offer_interest for delete to authenticated using (profile_id = auth.uid());

revoke all on public.offers, public.offer_interest from anon, authenticated;
grant select on public.offers to anon, authenticated;
grant insert, delete on public.offers to authenticated;
grant update (kind, title, body_md, price, link, closed_at, updated_at) on public.offers to authenticated;
grant select, insert, delete on public.offer_interest to authenticated;
grant select on public.offers, public.offer_interest to service_role;

-- No more than 10 open offers per member.
create or replace function public.offers_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.closed_at is null and (select count(*) from public.offers o where o.profile_id = new.profile_id and o.closed_at is null and o.id <> new.id) >= 10 then
    raise exception 'too many open offers';
  end if;
  return new;
end $$;
drop trigger if exists offers_limit on public.offers;
create trigger offers_limit before insert or update of closed_at on public.offers for each row execute function public.offers_limit();

-- How many people are interested — public counts for every offer of a member.
create or replace function public.offer_counts(p_profile uuid)
returns table (offer_id uuid, interested int)
language sql stable security definer set search_path = public as $$
  select o.id, (select count(*)::int from public.offer_interest i where i.offer_id = o.id)
  from public.offers o where o.profile_id = p_profile;
$$;

-- 2. "i need" → orders, "i can" removed, the old table and matching go ---------------------------------
do $$
begin
  if to_regclass('public.needs_offers') is not null then
    insert into public.offers (profile_id, kind, title, body_md, created_at)
    select n.profile_id, 'order',
           case when char_length(n.body) <= 120 then n.body else left(n.body, 117) || '…' end,
           case when char_length(n.body) > 120 then n.body else '' end,
           n.created_at
    from public.needs_offers n
    join public.profiles p on p.id = n.profile_id and p.status = 'active'
    where n.kind = 'need' and char_length(trim(n.body)) >= 3
      and (select count(*) from public.needs_offers x where x.profile_id = n.profile_id and x.kind = 'need' and x.created_at <= n.created_at) <= 10;
  end if;
end $$;

drop function if exists public.needs_count(uuid);
drop table if exists public.needs_offers;
drop table if exists public.match_cache;

-- 3. Feed, ghost and export know about offers --------------------------------------------------------
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
    union all
    select 'offer', o.id::text, o.created_at, o.profile_id, o.profile_id, null::text, null::text,
           (select count(*) from public.offer_interest i where i.offer_id = o.id),
           exists (select 1 from public.offer_interest i where i.offer_id = o.id and i.profile_id = auth.uid())
    from public.offers o
    where o.closed_at is null and o.profile_id in (select id from circle)
  ) events
  order by 3 desc
  limit greatest(1, least(p_limit, 200));
$$;

create or replace function public.become_ghost()
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set handle = null, name = null, role = null, bio_md = '', avatar_path = null, links = '{}'::jsonb,
         city_id = null, birth_date = null, open_to_hiring = false, open_to_network = false,
         status = 'ghost', deleted_at = now()
   where id = auth.uid();
  delete from public.offers where profile_id = auth.uid();
  delete from public.offer_interest where profile_id = auth.uid();
  delete from public.profile_spheres where profile_id = auth.uid();
  delete from public.wall_posts where author_id = auth.uid() or wall_owner_id = auth.uid();
  delete from public.post_fires where profile_id = auth.uid();
  delete from public.hidden where profile_id = auth.uid();
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
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('kind', o.kind, 'title', o.title, 'text', o.body_md, 'price', o.price,
                                                       'link', o.link, 'closed_at', o.closed_at, 'at', o.created_at)), '[]'::jsonb)
               from public.offers o where o.profile_id = auth.uid()),
    'interested_in', (select coalesce(jsonb_agg(jsonb_build_object('offer', o.title, 'by', a.handle, 'at', i.created_at)), '[]'::jsonb)
                      from public.offer_interest i join public.offers o on o.id = i.offer_id join public.profiles a on a.id = o.profile_id
                      where i.profile_id = auth.uid()),
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

grant execute on function public.offer_counts(uuid), public.is_active_member(uuid) to anon, authenticated;
