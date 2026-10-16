-- Connect and feed.
-- my_birth_date(): the birthday is hidden from everyone through column grants, so the owner reads it here.
-- outgoing_requests(): my pending intro requests with their fires.
-- requests_to_back(): requests where I'm a mutual and can back the intro with a 🔥.
-- feed(): what happened around me — handshakes, intros and wall posts in my circle.

create or replace function public.my_birth_date()
returns date language sql stable security definer set search_path = public as $$
  select birth_date from public.profiles where id = auth.uid();
$$;

create or replace function public.outgoing_requests()
returns table (id uuid, to_id uuid, created_at timestamptz, fires bigint, mutuals uuid[])
language sql stable security definer set search_path = public as $$
  select r.id, r.to_id, r.created_at,
         count(*) filter (where rm.backed),
         array_remove(array_agg(rm.mutual_id), null)
  from public.intro_requests r
  left join public.request_mutuals rm on rm.request_id = r.id
  where r.from_id = auth.uid() and r.status = 'pending'
  group by r.id
  order by r.created_at desc;
$$;

create or replace function public.requests_to_back()
returns table (id uuid, from_id uuid, to_id uuid, created_at timestamptz, backed boolean, fires bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.from_id, r.to_id, r.created_at, rm.backed,
         (select count(*) from public.request_mutuals x where x.request_id = r.id and x.backed)
  from public.request_mutuals rm
  join public.intro_requests r on r.id = rm.request_id
  where rm.mutual_id = auth.uid() and r.status = 'pending'
  order by rm.backed, r.created_at desc;
$$;

-- The circle is me and my connections. An event between A and B shows up when both are in my
-- circle, or when one of them is me or a connection who keeps "open to network" on.
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
           i.selfie_path
    from public.connections c
    left join public.invites i on i.id = c.invite_id
    left join public.intro_requests r on r.id = c.request_id
    where (c.user_a in (select id from circle) and c.user_b in (select id from circle))
       or c.user_a in (select id from open_circle)
       or c.user_b in (select id from open_circle)
  )
  select * from (
    select case when l.kind = 'met' then 'handshake' else 'intro' end,
           l.user_a::text || ':' || l.user_b::text,
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

revoke execute on function public.my_birth_date(), public.outgoing_requests(), public.requests_to_back(), public.feed(int) from public, anon;
grant execute on function public.my_birth_date(), public.outgoing_requests(), public.requests_to_back(), public.feed(int) to authenticated;
