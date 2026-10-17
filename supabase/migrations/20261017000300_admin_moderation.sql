-- Admin panel, stage 2 (2026-10-17): events, offers, one moderation queue, the action log.
-- Members can now report an offer or a member; three reports hide an offer until an admin decides.
-- Admins hide offers with a reason (the author still sees them), review events with a note,
-- and every admin action lands in admin_actions.

-- 1. Columns -----------------------------------------------------------------------------------------
alter table public.events add column if not exists review_note text check (char_length(review_note) <= 500);
-- Why an event was rejected: readable wherever the event is (a rejected event is seen only by its host and admins).
grant select (review_note) on public.events to anon, authenticated;

alter table public.offers add column if not exists hidden_at timestamptz;
alter table public.offers add column if not exists hidden_reason text check (char_length(hidden_reason) <= 500);
alter table public.offers add column if not exists flagged_at timestamptz;   -- 3 reports, waiting for an admin

alter table public.reports add column if not exists target_offer_id uuid references public.offers (id) on delete cascade;
alter table public.reports drop constraint if exists reports_target;
alter table public.reports add constraint reports_target
  check (target_profile_id is not null or target_post_id is not null or target_invite_id is not null or target_offer_id is not null);
create unique index if not exists reports_one_per_offer on public.reports (reporter_id, target_offer_id) where target_offer_id is not null;
create unique index if not exists reports_one_open_per_member on public.reports (reporter_id, target_profile_id)
  where target_profile_id is not null and resolved_at is null;
create index if not exists reports_open_idx on public.reports (created_at) where resolved_at is null;

-- 2. Hidden offers: only the author and admins see them ---------------------------------------------
create or replace function public.offer_visible(p_author uuid, p_hidden timestamptz, p_flagged timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_member(p_author)
     and ((p_hidden is null and p_flagged is null) or p_author = auth.uid() or public.is_admin());
$$;

drop policy if exists "offers are public" on public.offers;
create policy "offers are public" on public.offers for select using (public.offer_visible(profile_id, hidden_at, flagged_at));

drop policy if exists "members show interest" on public.offer_interest;
create policy "members show interest" on public.offer_interest for insert to authenticated with check (
  profile_id = auth.uid() and public.is_active_member(auth.uid())
  and exists (select 1 from public.offers o where o.id = offer_id and o.closed_at is null and o.hidden_at is null
                                            and o.flagged_at is null and o.profile_id <> auth.uid())
);

-- 3. Reports from members ------------------------------------------------------------------------------
-- An offer: three different members hide it until an admin keeps or hides it for good.
create or replace function public.report_offer(p_offer uuid, p_reason text default 'inappropriate offer')
returns int language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null or not public.is_active_member(me) then raise exception 'not a member'; end if;
  if not exists (select 1 from public.offers o where o.id = p_offer and o.hidden_at is null and o.profile_id <> me) then
    raise exception 'offer not found';
  end if;
  insert into public.reports (reporter_id, target_offer_id, reason)
  values (me, p_offer, left(coalesce(nullif(trim(p_reason), ''), 'inappropriate offer'), 1000))
  on conflict do nothing;
  select count(distinct reporter_id) into n from public.reports where target_offer_id = p_offer and resolved_at is null;
  if n >= 3 then
    update public.offers set flagged_at = coalesce(flagged_at, now()) where id = p_offer;
  end if;
  return n;
end $$;

-- A member: goes straight to the queue, nothing is hidden automatically.
create or replace function public.report_member(p_profile uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_active_member(me) then raise exception 'not a member'; end if;
  if p_profile = me then raise exception 'not yourself'; end if;
  if not public.is_active_member(p_profile) then raise exception 'member not found'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'reason required'; end if;
  insert into public.reports (reporter_id, target_profile_id, reason)
  values (me, p_profile, left(trim(p_reason), 1000))
  on conflict do nothing;
end $$;

-- 4. Badges: events to review, reports to handle, offers hidden by reports ------------------------------
drop function if exists public.admin_badges();
create function public.admin_badges()
returns table (events bigint, reports bigint, offers bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query select
    (select count(*) from public.events e where e.review = 'pending' and e.cancelled_at is null),
    (select count(distinct coalesce(r.target_invite_id::text, r.target_offer_id::text, r.target_post_id::text, r.target_profile_id::text))
       from public.reports r where r.resolved_at is null),
    (select count(*) from public.offers o where o.flagged_at is not null and o.hidden_at is null);
end $$;

-- 5. Handshakes and events: the old admin functions now write to the log --------------------------------
create or replace function public.admin_resolve_handshake(p_invite uuid, p_cancel boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  a uuid;
  b uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select c.user_a, c.user_b into a, b from public.connections c where c.invite_id = p_invite limit 1;
  if p_cancel then
    -- a handshake on top of an intro falls back to the intro; a pure handshake goes away
    update public.connections set kind = 'intro', invite_id = null where invite_id = p_invite and request_id is not null;
    delete from public.connections where invite_id = p_invite;
  else
    update public.invites set flagged_at = null where id = p_invite;
  end if;
  update public.reports set resolved_at = now() where target_invite_id = p_invite and resolved_at is null;
  perform public.admin_log_action(case when p_cancel then 'cancel_handshake' else 'keep_handshake' end, 'invite', p_invite::text, null,
                                  jsonb_build_object('profiles', jsonb_build_array(a, b)));
end $$;

create or replace function public.admin_review_event(p_event uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if not p_approve and nullif(trim(p_note), '') is null then raise exception 'reason required'; end if;
  update public.events
     set review = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now(),
         review_note = case when p_approve then null else left(trim(p_note), 500) end
   where id = p_event;
  if not found then raise exception 'event not found'; end if;
  perform public.admin_log_action(case when p_approve then 'approve_event' else 'reject_event' end, 'event', p_event::text, p_note);
end $$;

-- The event page in the app keeps calling review_event: same thing, logged, without a note.
create or replace function public.review_event(p_event uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.events set review = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now()
   where id = p_event;
  perform public.admin_log_action(case when p_approve then 'approve_event' else 'reject_event' end, 'event', p_event::text);
end $$;

create or replace function public.admin_cancel_event(p_event uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'reason required'; end if;
  update public.events set cancelled_at = now(), updated_at = now() where id = p_event and cancelled_at is null;
  if not found then raise exception 'nothing to change'; end if;
  perform public.admin_log_action('cancel_event', 'event', p_event::text, p_reason);
end $$;

create or replace function public.admin_new_checkin_code(p_event uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  c text;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.events set checkin_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) where id = p_event
  returning checkin_code into c;
  if c is null then raise exception 'event not found'; end if;
  perform public.admin_log_action('new_checkin_code', 'event', p_event::text);
  return c;
end $$;

-- 6. Events list and one event --------------------------------------------------------------------------
-- status: pending (waiting review, not cancelled) · approved · rejected · cancelled
create or replace function public.admin_events(
  p_status text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_city int default null, p_q text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, slug text, title text, cover_path text, starts_at timestamptz, ends_at timestamptz, timezone text,
               online boolean, city text, venue text, review text, review_note text, cancelled_at timestamptz, created_at timestamptz,
               host_id uuid, host_name text, going bigint, checked_in bigint, connections bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  q text := nullif(trim(p_q), '');
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if q is not null then q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  return query
  select e.id, e.slug, e.title, e.cover_path, e.starts_at, e.ends_at, e.timezone, e.online, c.name, e.venue, e.review,
         e.review_note, e.cancelled_at, e.created_at, e.host_id, h.name,
         (select count(*) from public.event_people x where x.event_id = e.id and x.going_at is not null),
         (select count(*) from public.event_people x where x.event_id = e.id and x.checked_in_at is not null),
         (select count(*) from public.connections k where k.event_id = e.id),
         count(*) over ()
    from public.events e
    left join public.cities c on c.id = e.city_id
    left join public.profiles h on h.id = e.host_id
   where (p_status is null
          or (p_status = 'cancelled' and e.cancelled_at is not null)
          or (p_status <> 'cancelled' and e.cancelled_at is null and e.review = p_status))
     and (p_from is null or e.starts_at >= p_from)
     and (p_to is null or e.starts_at < p_to)
     and (p_city is null or e.city_id = p_city)
     and (q is null or e.title ilike q or h.name ilike q)
   order by (e.review = 'pending' and e.cancelled_at is null) desc, e.starts_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0));
end $$;

create or replace function public.admin_event(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e public.events;
  w_from timestamptz;
  w_to timestamptz;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into e from public.events where id = p_id;
  if not found then raise exception 'event not found'; end if;
  w_from := e.starts_at - interval '3 hours';
  w_to := coalesce(e.ends_at, e.starts_at + interval '8 hours') + interval '3 hours';
  return jsonb_build_object(
    'event', to_jsonb(e) - 'body_md' || jsonb_build_object(
      'city', (select c.name from public.cities c where c.id = e.city_id),
      'host', (select jsonb_build_object('id', h.id, 'name', h.name, 'handle', h.handle, 'avatar_path', h.avatar_path, 'status', h.status)
                 from public.profiles h where h.id = e.host_id)),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'handle', p.handle, 'avatar_path', p.avatar_path,
                                                            'status', p.status, 'going_at', ep.going_at, 'checked_in_at', ep.checked_in_at)
                                         order by ep.checked_in_at nulls last, ep.going_at), '[]'::jsonb)
                 from public.event_people ep join public.profiles p on p.id = ep.user_id where ep.event_id = e.id),
    'connections', (select count(*) from public.connections k where k.event_id = e.id),
    -- newcomers brought in on the spot: a checked-in member's selfie during the check-in window
    'joined', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'handle', p.handle, 'avatar_path', p.avatar_path,
                                                            'invited_by', p.invited_by, 'created_at', p.created_at) order by p.created_at), '[]'::jsonb)
                 from public.profiles p
                 join public.invites i on i.joined_user_id = p.id and i.inviter_id = p.invited_by and i.status = 'joined'
                 join public.event_people ep on ep.user_id = i.inviter_id and ep.event_id = e.id and ep.checked_in_at is not null
                where e.review = 'approved' and e.cancelled_at is null and i.created_at between w_from and w_to),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason, 'created_at', a.created_at,
                                                             'admin', (select q.name from public.profiles q where q.id = a.admin_id))
                                          order by a.created_at desc), '[]'::jsonb)
                  from public.admin_actions a where a.target_type = 'event' and a.target_id = e.id::text)
  );
end $$;

-- 7. Offers ------------------------------------------------------------------------------------------------
-- status: open · closed · hidden (by an admin) · flagged (hidden by reports, waiting)
create or replace function public.admin_offers(
  p_kind text default null, p_status text default null, p_author uuid default null, p_q text default null,
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, kind text, title text, body_md text, price text, link text, created_at timestamptz, closed_at timestamptz,
               hidden_at timestamptz, hidden_reason text, flagged_at timestamptz, profile_id uuid, author_name text, author_handle text,
               author_avatar text, author_status public.profile_status, interest bigint, open_reports bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  q text := nullif(trim(p_q), '');
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if q is not null then q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  return query
  select o.id, o.kind, o.title, o.body_md, o.price, o.link, o.created_at, o.closed_at, o.hidden_at, o.hidden_reason, o.flagged_at,
         o.profile_id, p.name, p.handle, p.avatar_path, p.status,
         (select count(*) from public.offer_interest i where i.offer_id = o.id),
         (select count(*) from public.reports r where r.target_offer_id = o.id and r.resolved_at is null),
         count(*) over ()
    from public.offers o
    join public.profiles p on p.id = o.profile_id
   where (p_kind is null or o.kind = p_kind)
     and (p_author is null or o.profile_id = p_author)
     and (q is null or o.title ilike q or p.name ilike q or p.handle ilike q)
     and (p_status is null
          or (p_status = 'hidden' and o.hidden_at is not null)
          or (p_status = 'flagged' and o.flagged_at is not null and o.hidden_at is null)
          or (p_status = 'open' and o.closed_at is null and o.hidden_at is null and o.flagged_at is null)
          or (p_status = 'closed' and o.closed_at is not null and o.hidden_at is null))
   order by (o.flagged_at is not null and o.hidden_at is null) desc, o.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- Offer actions log as target 'offer' with the author in meta, so the member card shows them too.
create or replace function public.admin_close_offer(p_offer uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.offers;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.offers set closed_at = now(), updated_at = now() where id = p_offer and closed_at is null returning * into o;
  if not found then raise exception 'offer not found or already closed'; end if;
  perform public.admin_log_action('close_offer', 'offer', p_offer::text, p_reason, jsonb_build_object('profile_id', o.profile_id, 'title', o.title));
end $$;

create or replace function public.admin_hide_offer(p_offer uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.offers;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'reason required'; end if;
  update public.offers set hidden_at = now(), hidden_reason = left(trim(p_reason), 500), flagged_at = null
   where id = p_offer and hidden_at is null returning * into o;
  if not found then raise exception 'nothing to change'; end if;
  update public.reports set resolved_at = now() where target_offer_id = p_offer and resolved_at is null;
  perform public.admin_log_action('hide_offer', 'offer', p_offer::text, p_reason, jsonb_build_object('profile_id', o.profile_id, 'title', o.title));
end $$;

-- Keep (after reports) or bring back (after hiding): the offer is visible again, open reports are closed.
create or replace function public.admin_unhide_offer(p_offer uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.offers;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.offers set hidden_at = null, hidden_reason = null, flagged_at = null
   where id = p_offer and (hidden_at is not null or flagged_at is not null) returning * into o;
  if not found then raise exception 'nothing to change'; end if;
  update public.reports set resolved_at = now() where target_offer_id = p_offer and resolved_at is null;
  perform public.admin_log_action('keep_offer', 'offer', p_offer::text, p_reason, jsonb_build_object('profile_id', o.profile_id, 'title', o.title));
end $$;

create or replace function public.admin_delete_offer(p_offer uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.offers;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'reason required'; end if;
  delete from public.offers where id = p_offer returning * into o;
  if not found then raise exception 'offer not found'; end if;
  perform public.admin_log_action('delete_offer', 'offer', p_offer::text, p_reason,
                                  jsonb_build_object('profile_id', o.profile_id, 'title', o.title, 'kind', o.kind));
end $$;

-- 8. Reports about members: dismissed or handled (a ban is a separate action) -----------------------------
create or replace function public.admin_resolve_member_reports(p_profile uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.reports set resolved_at = now() where target_profile_id = p_profile and resolved_at is null;
  if not found then raise exception 'nothing to change'; end if;
  perform public.admin_log_action('resolve_member_reports', 'profile', p_profile::text, p_reason);
end $$;

-- 9. One queue, oldest first: reported handshakes, events to review, reported offers, reported members -----
create or replace function public.admin_queue()
returns table (kind text, target_id text, since timestamptz, reports bigint, reasons text[], data jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  select * from (
    select 'handshake'::text, i.id::text, min(r.created_at), count(distinct r.reporter_id), array_agg(distinct r.reason),
           jsonb_build_object('inviter_id', i.inviter_id,
                              'guest_id', coalesce(i.joined_user_id, case when c.user_a = i.inviter_id then c.user_b else c.user_a end),
                              'selfie_path', i.selfie_path, 'met_at', c.created_at, 'flagged_at', i.flagged_at)
      from public.reports r
      join public.invites i on i.id = r.target_invite_id
      join public.connections c on c.invite_id = i.id
     where r.resolved_at is null
     group by i.id, c.user_a, c.user_b, c.created_at
    union all
    select 'event', e.id::text, e.created_at, 0::bigint, null::text[],
           jsonb_build_object('slug', e.slug, 'title', e.title, 'cover_path', e.cover_path, 'starts_at', e.starts_at,
                              'ends_at', e.ends_at, 'timezone', e.timezone, 'host_id', e.host_id, 'online', e.online::text,
                              'city', (select ci.name from public.cities ci where ci.id = e.city_id))
      from public.events e where e.review = 'pending' and e.cancelled_at is null
    union all
    select 'offer', o.id::text, min(r.created_at), count(distinct r.reporter_id), array_agg(distinct r.reason),
           jsonb_build_object('title', o.title, 'kind', o.kind, 'body_md', o.body_md, 'price', o.price, 'link', o.link,
                              'profile_id', o.profile_id, 'flagged_at', o.flagged_at, 'closed_at', o.closed_at)
      from public.reports r join public.offers o on o.id = r.target_offer_id
     where r.resolved_at is null
     group by o.id
    union all
    select 'member', p.id::text, min(r.created_at), count(distinct r.reporter_id), array_agg(distinct r.reason),
           jsonb_build_object('profile_id', p.id, 'status', p.status)
      from public.reports r join public.profiles p on p.id = r.target_profile_id
     where r.resolved_at is null
     group by p.id
  ) x
  order by 3 asc;
end $$;

-- People by id for the admin screens, banned ones included (the public card policy hides them).
create or replace function public.admin_people(p_ids uuid[])
returns table (id uuid, name text, handle text, avatar_path text, status public.profile_status)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query select p.id, p.name, p.handle, p.avatar_path, p.status from public.profiles p where p.id = any (p_ids);
end $$;

-- 10. The log ---------------------------------------------------------------------------------------------
-- Newest first, paged by id. Views of member cards are left out unless asked for.
create or replace function public.admin_log(p_limit int default 50, p_before bigint default null, p_action text default null)
returns table (id bigint, created_at timestamptz, action text, target_type text, target_id text, reason text, meta jsonb,
               admin_id uuid, admin_name text, target_label text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  select a.id, a.created_at, a.action, a.target_type, a.target_id, a.reason, a.meta, a.admin_id,
         (select q.name from public.profiles q where q.id = a.admin_id),
         case a.target_type
           when 'profile' then (select coalesce(q.name, 'a ghost') from public.profiles q where q.id::text = a.target_id)
           when 'event' then (select ev.title from public.events ev where ev.id::text = a.target_id)
           when 'offer' then coalesce((select o.title from public.offers o where o.id::text = a.target_id), a.meta->>'title')
           when 'invite' then (select string_agg(coalesce(q.name, 'a ghost'), ' & ')
                                 from jsonb_array_elements_text(coalesce(a.meta->'profiles', '[]'::jsonb)) x(pid)
                                 join public.profiles q on q.id::text = x.pid)
         end
    from public.admin_actions a
   where (p_before is null or a.id < p_before)
     and (case when p_action is null then a.action <> 'view_member' else a.action = p_action end)
   order by a.id desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

-- 11. Feed: hidden and flagged offers leave it (same function as in the offers migration otherwise) ---------
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
    where o.closed_at is null and o.hidden_at is null and o.flagged_at is null and o.profile_id in (select id from circle)
  ) events
  order by 3 desc
  limit greatest(1, least(p_limit, 200));
$$;

-- 12. Member card: reports about their offers, offer state, and offer actions in their log -----------------
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
                                                            'hidden_at', o.hidden_at, 'hidden_reason', o.hidden_reason, 'flagged_at', o.flagged_at,
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
                           'about', case when r.target_invite_id is not null then 'handshake' when r.target_offer_id is not null then 'offer'
                                         when r.target_post_id is not null then 'post' else 'member' end,
                           'reporter', jsonb_build_object('id', q.id, 'handle', q.handle, 'name', q.name)) order by r.created_at desc), '[]'::jsonb)
                          from public.reports r join public.profiles q on q.id = r.reporter_id
                         where r.target_profile_id = p.id
                            or r.target_post_id in (select w.id from public.wall_posts w where w.author_id = p.id)
                            or r.target_offer_id in (select o.id from public.offers o where o.profile_id = p.id)
                            or r.target_invite_id in (select i.id from public.invites i where p.id in (i.inviter_id, i.joined_user_id))),
    'reports_by', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', r.id, 'reason', r.reason, 'created_at', r.created_at, 'resolved_at', r.resolved_at,
                      'about', case when r.target_invite_id is not null then 'handshake' when r.target_offer_id is not null then 'offer'
                                    when r.target_post_id is not null then 'post' else 'member' end) order by r.created_at desc), '[]'::jsonb)
                     from public.reports r where r.reporter_id = p.id),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason, 'created_at', a.created_at,
                                                             'admin', (select q.name from public.profiles q where q.id = a.admin_id))
                                          order by a.created_at desc), '[]'::jsonb)
                  from (select * from public.admin_actions a
                         where ((a.target_type = 'profile' and a.target_id = p.id::text) or a.meta->>'profile_id' = p.id::text
                                or a.meta->'profiles' ? p.id::text)
                           and a.action <> 'view_member' order by a.created_at desc limit 30) a)
  );
end $$;

-- 13. Access ---------------------------------------------------------------------------------------------------
revoke all on function public.offer_visible(uuid, timestamptz, timestamptz) from public;
grant execute on function public.offer_visible(uuid, timestamptz, timestamptz) to anon, authenticated;
revoke execute on function public.report_offer(uuid, text), public.report_member(uuid, text), public.admin_badges(),
  public.admin_review_event(uuid, boolean, text), public.admin_cancel_event(uuid, text), public.admin_new_checkin_code(uuid),
  public.admin_events(text, timestamptz, timestamptz, int, text, int, int), public.admin_event(uuid),
  public.admin_offers(text, text, uuid, text, int, int), public.admin_close_offer(uuid, text), public.admin_hide_offer(uuid, text),
  public.admin_unhide_offer(uuid, text), public.admin_delete_offer(uuid, text), public.admin_resolve_member_reports(uuid, text),
  public.admin_queue(), public.admin_log(int, bigint, text), public.admin_member(uuid), public.admin_people(uuid[])
  from public, anon;
grant execute on function public.report_offer(uuid, text), public.report_member(uuid, text), public.admin_badges(),
  public.admin_review_event(uuid, boolean, text), public.admin_cancel_event(uuid, text), public.admin_new_checkin_code(uuid),
  public.admin_events(text, timestamptz, timestamptz, int, text, int, int), public.admin_event(uuid),
  public.admin_offers(text, text, uuid, text, int, int), public.admin_close_offer(uuid, text), public.admin_hide_offer(uuid, text),
  public.admin_unhide_offer(uuid, text), public.admin_delete_offer(uuid, text), public.admin_resolve_member_reports(uuid, text),
  public.admin_queue(), public.admin_log(int, bigint, text), public.admin_member(uuid), public.admin_people(uuid[])
  to authenticated;
