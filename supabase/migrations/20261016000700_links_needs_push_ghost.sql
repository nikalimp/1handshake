-- 1. City from location: coordinates for cities, the nearest city to a point.
-- 2. Social links on the card.
-- 3. I need / I can: counts for the public card (contents stay members-only), a cache for matches.
-- 4. Browser push subscriptions.
-- 5. Account deletion → ghost, now also clearing links, pushes and invite selfies; data export.

-- 1. Cities -----------------------------------------------------------------------------------
alter table public.cities add column if not exists lat double precision;
alter table public.cities add column if not exists lng double precision;
update public.cities set lat = 51.1694, lng = 71.4491 where name = 'Astana' and lat is null;
update public.cities set lat = -8.6500, lng = 115.2167 where name = 'Bali' and lat is null;
-- Coordinates for the world list come with supabase/seed_cities.sql.

-- Nearest city to a point. Within 25 km the biggest city wins (a suburb counts as the city);
-- further than 150 km from any city, nothing.
create or replace function public.nearest_city(p_lat double precision, p_lng double precision)
returns table (id int, name text, country text)
language sql stable security definer set search_path = public as $$
  with d as (
    select c.id, c.name, c.country, c.population,
           111.2 * sqrt(power(c.lat - p_lat, 2) + power((c.lng - p_lng) * cos(radians(p_lat)), 2)) as km
    from public.cities c
    where c.lat is not null and p_lat between -90 and 90 and p_lng between -180 and 180
  )
  select d.id, d.name, d.country from d
  where d.km < 150
  order by (d.km > 25), case when d.km <= 25 then -d.population::float8 else d.km end
  limit 1;
$$;

-- 2. Links --------------------------------------------------------------------------------------
-- {"telegram": "https://t.me/nik", "linkedin": "...", "x": "...", "github": "...", "website": "..."}
alter table public.profiles add column if not exists links jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_links_object;
alter table public.profiles add constraint profiles_links_object check (jsonb_typeof(links) = 'object' and pg_column_size(links) < 2000);
grant select (links) on public.profiles to anon, authenticated;
grant update (links) on public.profiles to authenticated;

-- 3. I need / I can -----------------------------------------------------------------------------
create or replace function public.needs_count(p_profile uuid)
returns table (needs int, cans int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where n.kind = 'need')::int, count(*) filter (where n.kind = 'can')::int
  from public.needs_offers n
  join public.profiles p on p.id = n.profile_id and p.status = 'active'
  where n.profile_id = p_profile;
$$;

-- Matches are worked out by the app (Claude, or keywords without a key) and cached per member.
create table if not exists public.match_cache (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  input_hash text not null,
  result     jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.match_cache enable row level security;
drop policy if exists "own match cache" on public.match_cache;
create policy "own match cache" on public.match_cache for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, insert, update, delete on public.match_cache to authenticated;

-- 4. Push ---------------------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for select using (profile_id = auth.uid());
grant select on public.push_subscriptions to authenticated;
-- The server sends pushes with the service key; members save and drop their own device here.

-- A device belongs to whoever signed in on it last.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'not a member';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'bad endpoint'; end if;
  insert into public.push_subscriptions (endpoint, profile_id, p256dh, auth)
  values (p_endpoint, auth.uid(), left(p_p256dh, 200), left(p_auth, 100))
  on conflict (endpoint) do update set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.drop_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
$$;

-- 5. Ghost and export ---------------------------------------------------------------------------
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
  update public.invites set selfie_path = null where inviter_id = auth.uid();
  update public.invites set status = 'cancelled' where inviter_id = auth.uid() and status in ('live', 'scanned');
  update public.intro_requests set status = 'declined', decided_at = now()
   where status = 'pending' and (from_id = auth.uid() or to_id = auth.uid());
$$;

-- Everything the club keeps about me, as one JSON document.
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
                   where w.deleted_at is null and auth.uid() in (w.author_id, w.wall_owner_id))
  );
$$;

revoke execute on function public.save_push_subscription(text, text, text), public.drop_push_subscription(text), public.my_export()
  from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.drop_push_subscription(text), public.my_export()
  to authenticated;
grant execute on function public.nearest_city(double precision, double precision), public.needs_count(uuid) to anon, authenticated;

-- The server's service key reads devices to send pushes (in case new tables aren't auto-exposed).
grant select, delete on public.push_subscriptions to service_role;
grant select on public.profiles, public.intro_requests, public.request_mutuals to service_role;
