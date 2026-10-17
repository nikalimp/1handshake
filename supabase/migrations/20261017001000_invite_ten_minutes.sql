-- An invite QR lives 10 minutes instead of 5 (Nik, 2026-10-17). After the scan the guest still has
-- 30 minutes to finish (open_invite), and the inviter's waiting screen shows that countdown.
alter table public.invites alter column expires_at set default now() + interval '10 minutes';
