-- 1handshake — initial schema
-- Postgres on Supabase. People and their handshakes live in a graph:
-- profiles are nodes, connections are undirected edges stored once (user_a < user_b).
-- Privacy rules are enforced in the database: RLS for direct table access,
-- SECURITY DEFINER functions for graph queries that must respect open_to_* switches.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.profile_status  as enum ('active', 'ghost', 'banned');
create type public.connection_kind as enum ('met', 'intro');           -- 🤝 met in person · 🔗 via intro
create type public.invite_status   as enum ('live', 'scanned', 'joined', 'expired', 'cancelled');
create type public.guest_step      as enum ('welcome', 'about', 'card', 'done');
create type public.request_status  as enum ('pending', 'accepted', 'declined');
create type public.need_kind       as enum ('need', 'can');

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.cities (
  id      serial primary key,
  name    text not null unique,          -- lowercase, e.g. 'tbilisi'
  country text
);

create table public.spheres (
  id        serial primary key,
  parent_id int references public.spheres (id),
  name      text not null,
  unique nulls not distinct (parent_id, name)
);

-- ---------------------------------------------------------------------------
-- Profiles (one per member). id = auth.users.id at sign-up.
-- No foreign key to auth.users on purpose: when a member deletes the account
-- the auth user is removed but the profile stays as an anonymous ghost node,
-- so other members' intro chains don't break.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key,
  handle          text unique check (handle ~ '^[a-z0-9_]{2,30}$'),
  name            text check (char_length(name) <= 80),
  role            text check (char_length(role) <= 80),
  bio_md          text not null default '' check (char_length(bio_md) <= 4000),
  avatar_path     text,
  city_id         int references public.cities (id),
  birth_date      date,
  open_to_hiring  boolean not null default true,
  open_to_network boolean not null default true,
  invited_by      uuid references public.profiles (id) on delete set null,
  status          public.profile_status not null default 'active',
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint network_needs_hiring check (open_to_hiring or not open_to_network)
);
create index profiles_invited_by_idx on public.profiles (invited_by);

create table public.profile_spheres (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  sphere_id  int  not null references public.spheres (id),
  is_primary boolean not null default false,
  primary key (profile_id, sphere_id)
);
create unique index profile_spheres_one_primary on public.profile_spheres (profile_id) where is_primary;

-- ---------------------------------------------------------------------------
-- Invites: a joint selfie turned into a single-use QR that lives 5 minutes.
-- ---------------------------------------------------------------------------
create table public.invites (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  inviter_id     uuid not null references public.profiles (id) on delete cascade,
  selfie_path    text,
  status         public.invite_status not null default 'live',
  guest_step     public.guest_step,
  expires_at     timestamptz not null default now() + interval '5 minutes',
  scanned_at     timestamptz,
  joined_user_id uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index invites_inviter_idx on public.invites (inviter_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Intro requests ("connect" through mutuals) and fires from mutuals.
-- ---------------------------------------------------------------------------
create table public.intro_requests (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  status     public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (from_id <> to_id)
);
create unique index intro_requests_one_pending on public.intro_requests (from_id, to_id) where status = 'pending';
create index intro_requests_to_idx on public.intro_requests (to_id, status);

create table public.request_mutuals (
  request_id uuid not null references public.intro_requests (id) on delete cascade,
  mutual_id  uuid not null references public.profiles (id) on delete cascade,
  backed     boolean not null default false,          -- 🔥
  backed_at  timestamptz,
  primary key (request_id, mutual_id)
);
create index request_mutuals_mutual_idx on public.request_mutuals (mutual_id);

-- ---------------------------------------------------------------------------
-- Connections: one row per pair, user_a < user_b.
-- ---------------------------------------------------------------------------
create table public.connections (
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  kind       public.connection_kind not null,
  invite_id  uuid references public.invites (id) on delete set null,
  request_id uuid references public.intro_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index connections_user_b_idx on public.connections (user_b);

-- Both directions of every edge, for graph queries.
create view public.edges with (security_invoker = true) as
  select user_a as src, user_b as dst, kind, created_at from public.connections
  union all
  select user_b as src, user_a as dst, kind, created_at from public.connections;

-- ---------------------------------------------------------------------------
-- I need / I can, wall, hidden, reports
-- ---------------------------------------------------------------------------
create table public.needs_offers (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       public.need_kind not null,
  body       text not null check (char_length(body) between 1 and 500),
  embedding  vector,                                   -- dimension fixed once the embedding model is chosen
  created_at timestamptz not null default now()
);
create index needs_offers_profile_idx on public.needs_offers (profile_id);

create table public.wall_posts (
  id            uuid primary key default gen_random_uuid(),
  wall_owner_id uuid not null references public.profiles (id) on delete cascade,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index wall_posts_owner_idx on public.wall_posts (wall_owner_id, created_at desc);

create table public.post_fires (
  post_id    uuid not null references public.wall_posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.hidden (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  hidden_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, hidden_id)
);

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  target_profile_id uuid references public.profiles (id) on delete cascade,
  target_post_id    uuid references public.wall_posts (id) on delete cascade,
  reason            text not null check (char_length(reason) between 1 and 1000),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  check (target_profile_id is not null or target_post_id is not null)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_connected(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.connections
    where user_a = least(a, b) and user_b = greatest(a, b)
  );
$$;

create or replace function public.connect_pair(a uuid, b uuid, k public.connection_kind, inv uuid, req uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.connections (user_a, user_b, kind, invite_id, request_id)
  values (least(a, b), greatest(a, b), k, inv, req)
  on conflict (user_a, user_b) do nothing;
$$;
revoke all on function public.connect_pair(uuid, uuid, public.connection_kind, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Invite flow
-- ---------------------------------------------------------------------------

-- Member creates a fresh code. Any older live code of theirs is cancelled.
create or replace function public.create_invite(p_selfie_path text)
returns public.invites language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.invites;
begin
  if me is null or not exists (select 1 from public.profiles where id = me and status = 'active') then
    raise exception 'not a member';
  end if;
  update public.invites set status = 'cancelled' where inviter_id = me and status = 'live';
  insert into public.invites (inviter_id, selfie_path) values (me, p_selfie_path) returning * into inv;
  return inv;
end $$;

-- Guest opens 1handshake.com/i/<code>. Works for anonymous visitors.
-- First open marks the code as scanned and gives the guest 30 minutes to finish.
create or replace function public.open_invite(p_code text)
returns table (status public.invite_status, inviter_name text, inviter_handle text, selfie_path text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites i where i.code = p_code for update;
  if not found then
    return;
  end if;
  if inv.status = 'live' and inv.expires_at < now() then
    update public.invites i set status = 'expired' where i.id = inv.id returning * into inv;
  elsif inv.status = 'live' then
    update public.invites i
       set status = 'scanned', scanned_at = now(), guest_step = 'welcome',
           expires_at = now() + interval '30 minutes'
     where i.id = inv.id returning * into inv;
  end if;
  return query
    select inv.status, p.name, p.handle, inv.selfie_path, inv.expires_at
    from public.profiles p where p.id = inv.inviter_id;
end $$;

-- Guest reports progress so the inviter's waiting screen can follow along (realtime on invites).
create or replace function public.set_guest_step(p_code text, p_step public.guest_step)
returns void language sql security definer set search_path = public as $$
  update public.invites set guest_step = p_step
  where code = p_code and status = 'scanned' and expires_at > now();
$$;

-- Signed-in guest finishes registration: profile + 🤝 connection + invite consumed, all or nothing.
create or replace function public.accept_invite(
  p_code text, p_handle text, p_name text, p_role text, p_bio_md text,
  p_city_id int, p_birth_date date
) returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.invites;
  prof public.profiles;
begin
  if me is null then raise exception 'sign in first'; end if;
  if exists (select 1 from public.profiles where id = me) then raise exception 'already a member'; end if;

  select * into inv from public.invites where code = p_code for update;
  if not found then raise exception 'invite not found'; end if;
  if inv.status <> 'scanned' or inv.expires_at < now() then raise exception 'invite is no longer valid'; end if;

  insert into public.profiles (id, handle, name, role, bio_md, city_id, birth_date, invited_by)
  values (me, p_handle, p_name, p_role, coalesce(p_bio_md, ''), p_city_id, p_birth_date, inv.inviter_id)
  returning * into prof;

  perform public.connect_pair(me, inv.inviter_id, 'met', inv.id, null);
  update public.invites set status = 'joined', guest_step = 'done', joined_user_id = me where id = inv.id;
  return prof;
end $$;

-- ---------------------------------------------------------------------------
-- Graph: people one handshake away (the "connect" screen)
-- Visibility: the mutual must be open_to_network, the person open_to_hiring, both active.
-- ---------------------------------------------------------------------------
create or replace function public.people_one_handshake_away()
returns table (person uuid, mutuals uuid[])
language sql stable security definer set search_path = public as $$
  select fof.dst as person, array_agg(distinct e1.dst) as mutuals
  from public.edges e1
  join public.profiles m   on m.id = e1.dst and m.open_to_network and m.status = 'active'
  join public.edges fof    on fof.src = e1.dst
  join public.profiles p   on p.id = fof.dst and p.open_to_hiring and p.status = 'active'
  where e1.src = auth.uid()
    and fof.dst <> auth.uid()
    and not exists (select 1 from public.edges x where x.src = auth.uid() and x.dst = fof.dst)
    and not exists (select 1 from public.hidden h where h.profile_id = auth.uid() and h.hidden_id = fof.dst)
    and not exists (select 1 from public.intro_requests r
                    where r.from_id = auth.uid() and r.to_id = fof.dst and r.status = 'pending')
  group by fof.dst;
$$;

-- My connections and, where they allow it, theirs (the "graph" screen).
create or replace function public.my_graph()
returns table (src uuid, dst uuid, kind public.connection_kind)
language sql stable security definer set search_path = public as $$
  select e.src, e.dst, e.kind from public.edges e where e.src = auth.uid()
  union all
  select e2.src, e2.dst, e2.kind
  from public.edges e1
  join public.profiles m on m.id = e1.dst and m.open_to_network and m.status = 'active'
  join public.edges e2   on e2.src = e1.dst and e2.dst <> auth.uid()
  join public.profiles p on p.id = e2.dst and p.status = 'active'
  where e1.src = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Intro requests
-- ---------------------------------------------------------------------------
create or replace function public.request_intro(p_to uuid)
returns public.intro_requests language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  req public.intro_requests;
  mutuals uuid[];
begin
  if me is null then raise exception 'sign in first'; end if;
  select x.mutuals into mutuals from public.people_one_handshake_away() x where x.person = p_to;
  if mutuals is null then
    raise exception 'this person is not one handshake away';
  end if;
  insert into public.intro_requests (from_id, to_id) values (me, p_to) returning * into req;
  insert into public.request_mutuals (request_id, mutual_id) select req.id, unnest(mutuals);
  return req;
end $$;

create or replace function public.back_request(p_request uuid, p_backed boolean default true)
returns void language sql security definer set search_path = public as $$
  update public.request_mutuals
     set backed = p_backed, backed_at = case when p_backed then now() end
   where request_id = p_request and mutual_id = auth.uid();
$$;

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
  if p_accept then
    perform public.connect_pair(req.from_id, req.to_id, 'intro', null, req.id);
  end if;
end $$;

-- Incoming requests, most-backed first (pinned on top of "feed").
create or replace function public.incoming_requests()
returns table (id uuid, from_id uuid, created_at timestamptz, fires bigint, mutuals uuid[])
language sql stable security definer set search_path = public as $$
  select r.id, r.from_id, r.created_at,
         count(*) filter (where rm.backed) as fires,
         array_agg(rm.mutual_id) as mutuals
  from public.intro_requests r
  left join public.request_mutuals rm on rm.request_id = r.id
  where r.to_id = auth.uid() and r.status = 'pending'
  group by r.id
  order by fires desc, r.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion → ghost. Personal data is erased, the node and its edges stay.
-- Storage files and the auth user are removed by the server action that calls this.
-- ---------------------------------------------------------------------------
create or replace function public.become_ghost()
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set handle = null, name = null, role = null, bio_md = '', avatar_path = null,
         city_id = null, birth_date = null, open_to_hiring = false, open_to_network = false,
         status = 'ghost', deleted_at = now()
   where id = auth.uid();
  delete from public.needs_offers  where profile_id = auth.uid();
  delete from public.profile_spheres where profile_id = auth.uid();
  delete from public.wall_posts where author_id = auth.uid() or wall_owner_id = auth.uid();
  delete from public.hidden where profile_id = auth.uid();
  update public.intro_requests set status = 'declined', decided_at = now()
   where status = 'pending' and (from_id = auth.uid() or to_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.cities          enable row level security;
alter table public.spheres         enable row level security;
alter table public.profiles        enable row level security;
alter table public.profile_spheres enable row level security;
alter table public.invites         enable row level security;
alter table public.intro_requests  enable row level security;
alter table public.request_mutuals enable row level security;
alter table public.connections     enable row level security;
alter table public.needs_offers    enable row level security;
alter table public.wall_posts      enable row level security;
alter table public.post_fires      enable row level security;
alter table public.hidden          enable row level security;
alter table public.reports         enable row level security;

create policy "reference data is public" on public.cities  for select using (true);
create policy "reference data is public" on public.spheres for select using (true);

-- The visit card is public and indexed; banned profiles disappear.
create policy "cards are public" on public.profiles for select using (status <> 'banned');
create policy "members edit their own card" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- Columns a member may change themselves (status, invited_by, id stay server-side):
revoke update on public.profiles from anon, authenticated;
grant update (handle, name, role, bio_md, avatar_path, city_id, birth_date, open_to_hiring, open_to_network)
  on public.profiles to authenticated;
-- Birth date is never public:
revoke select on public.profiles from anon, authenticated;
grant select (id, handle, name, role, bio_md, avatar_path, city_id, open_to_hiring, open_to_network,
              invited_by, status, created_at) on public.profiles to anon, authenticated;

create policy "spheres are public" on public.profile_spheres for select using (true);
create policy "members set their spheres" on public.profile_spheres for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Inviters see their own invites (realtime waiting screen). Guests go through open_invite().
create policy "inviter reads own invites" on public.invites for select using (inviter_id = auth.uid());

create policy "parties read requests" on public.intro_requests for select
  using (from_id = auth.uid() or to_id = auth.uid());
create policy "mutuals and parties read backers" on public.request_mutuals for select
  using (mutual_id = auth.uid() or exists (
    select 1 from public.intro_requests r where r.id = request_id and (r.from_id = auth.uid() or r.to_id = auth.uid())));

create policy "members read own connections" on public.connections for select
  using (user_a = auth.uid() or user_b = auth.uid());

-- I need / I can: visible to signed-in members only (blurred on the public card).
create policy "members read needs" on public.needs_offers for select to authenticated using (true);
create policy "members manage own needs" on public.needs_offers for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Wall: members read; you write on your own wall or a connection's wall.
create policy "members read walls" on public.wall_posts for select to authenticated using (deleted_at is null);
create policy "write on own or connection's wall" on public.wall_posts for insert to authenticated
  with check (author_id = auth.uid() and (wall_owner_id = auth.uid() or public.is_connected(auth.uid(), wall_owner_id)));
create policy "author or wall owner removes a post" on public.wall_posts for update to authenticated
  using (author_id = auth.uid() or wall_owner_id = auth.uid());

create policy "members read fires" on public.post_fires for select to authenticated using (true);
create policy "members give own fires" on public.post_fires for insert to authenticated with check (profile_id = auth.uid());
create policy "members take back own fires" on public.post_fires for delete to authenticated using (profile_id = auth.uid());

create policy "own hidden list" on public.hidden for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "members file reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Table access for the Data API roles. Explicit on purpose: works whether or not
-- "Automatically expose new tables" is enabled in the Supabase project.
-- RLS policies above decide which rows; these grants decide which tables and columns.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;

grant select on public.cities, public.spheres to anon, authenticated;
grant select (id, handle, name, role, bio_md, avatar_path, city_id, open_to_hiring, open_to_network,
              invited_by, status, created_at) on public.profiles to anon, authenticated;
grant update (handle, name, role, bio_md, avatar_path, city_id, birth_date, open_to_hiring, open_to_network)
  on public.profiles to authenticated;
grant select on public.profile_spheres to anon, authenticated;
grant insert, update, delete on public.profile_spheres to authenticated;
grant select on public.invites, public.intro_requests, public.request_mutuals, public.connections to authenticated;
grant select, insert, update, delete on public.needs_offers to authenticated;
grant select, insert, update on public.wall_posts to authenticated;
grant select, insert, delete on public.post_fires to authenticated;
grant select, insert, delete on public.hidden to authenticated;
grant insert on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- Function access
-- ---------------------------------------------------------------------------
revoke execute on function public.create_invite(text), public.accept_invite(text, text, text, text, text, int, date),
  public.people_one_handshake_away(), public.my_graph(), public.request_intro(uuid),
  public.back_request(uuid, boolean), public.respond_request(uuid, boolean), public.incoming_requests(),
  public.become_ghost() from public, anon;
grant execute on function public.create_invite(text), public.accept_invite(text, text, text, text, text, int, date),
  public.people_one_handshake_away(), public.my_graph(), public.request_intro(uuid),
  public.back_request(uuid, boolean), public.respond_request(uuid, boolean), public.incoming_requests(),
  public.become_ghost() to authenticated;
grant execute on function public.open_invite(text), public.set_guest_step(text, public.guest_step) to anon, authenticated;
grant execute on function public.is_connected(uuid, uuid) to authenticated;

-- Realtime for the inviter's waiting screen (Supabase only).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.invites;
  end if;
end $$;
