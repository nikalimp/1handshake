-- Invite flow, part 2: the inviter can cancel a code, and a member who scans
-- another member's code gets an instant 🤝 connection instead of registration.

-- Inviter cancels their live or scanned code (the "cancel invite" button).
create or replace function public.cancel_invite(p_invite uuid)
returns void language sql security definer set search_path = public as $$
  update public.invites set status = 'cancelled'
  where id = p_invite and inviter_id = auth.uid() and status in ('live', 'scanned');
$$;

-- A signed-in member opens someone's code: connect them as "met in person" and use up the code.
-- Returns the inviter's id, or raises a readable error.
create or replace function public.handshake_with_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.invites;
begin
  if me is null or not exists (select 1 from public.profiles where id = me and status = 'active') then
    raise exception 'not a member';
  end if;
  select * into inv from public.invites where code = p_code for update;
  if not found then raise exception 'invite not found'; end if;
  if inv.inviter_id = me then raise exception 'this is your own code'; end if;
  if inv.status not in ('live', 'scanned') or inv.expires_at < now() then
    raise exception 'invite is no longer valid';
  end if;
  perform public.connect_pair(me, inv.inviter_id, 'met', inv.id, null);
  update public.invites set status = 'joined', guest_step = 'done', joined_user_id = me where id = inv.id;
  return inv.inviter_id;
end $$;

revoke execute on function public.cancel_invite(uuid), public.handshake_with_invite(text) from public, anon;
grant execute on function public.cancel_invite(uuid), public.handshake_with_invite(text) to authenticated;
