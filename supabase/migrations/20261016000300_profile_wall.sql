-- Profile and wall, part 1.
-- 1. When a member accepted the terms (GDPR: proof of consent). Private: no grants for clients.
-- 2. wall(): one member's wall — handshakes with the joint selfie, then posts with fires.

alter table public.profiles add column if not exists terms_accepted_at timestamptz;

-- Same as before, plus terms_accepted_at: the app only calls this after the agreement tick.
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

  insert into public.profiles (id, handle, name, role, bio_md, city_id, birth_date, invited_by, terms_accepted_at)
  values (me, p_handle, p_name, p_role, coalesce(p_bio_md, ''), p_city_id, p_birth_date, inv.inviter_id, now())
  returning * into prof;

  perform public.connect_pair(me, inv.inviter_id, 'met', inv.id, null);
  update public.invites set status = 'joined', guest_step = 'done', joined_user_id = me where id = inv.id;
  return prof;
end $$;

-- A member's wall, newest first. Members only.
-- kind = 'handshake': met in person, with the joint selfie from the invite (author = who invited).
-- kind = 'post': a wall post with its fires.
create or replace function public.wall(p_profile uuid)
returns table (kind text, id uuid, at timestamptz, author_id uuid, other_id uuid, body text, selfie_path text, fires bigint, fired boolean)
language sql stable security definer set search_path = public as $$
  with viewer as (
    select 1 from public.profiles me where me.id = auth.uid() and me.status = 'active'
  )
  select 'handshake', i.id, c.created_at, i.inviter_id,
         case when c.user_a = p_profile then c.user_b else c.user_a end,
         null::text, i.selfie_path, 0::bigint, false
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

revoke execute on function public.wall(uuid) from public, anon;
grant execute on function public.wall(uuid) to authenticated;
