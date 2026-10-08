-- INVITATION-ONLY RSVP schema for Supabase.
-- Run once on a NEW Supabase project. Codes are stored as SHA-256 hashes.
create extension if not exists pgcrypto;
create table if not exists public.retirement_invitations (
 id uuid primary key default gen_random_uuid(),
 code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
 label text not null check (char_length(label) between 1 and 120),
 max_guests integer not null default 1 check (max_guests between 1 and 12),
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.retirement_rsvps (
 id uuid primary key default gen_random_uuid(),
 invitation_id uuid not null unique references public.retirement_invitations(id) on delete restrict,
 full_name text not null check (char_length(full_name) between 2 and 120),
 email text not null check (char_length(email) <= 254),
 attendance text not null check (attendance in ('yes','no')),
 guest_count integer not null check (guest_count between 0 and 12),
 message text not null default '' check (char_length(message) <= 500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists retirement_rsvps_attendance_idx on public.retirement_rsvps(attendance);
alter table public.retirement_invitations enable row level security;
alter table public.retirement_rsvps enable row level security;
-- No policies, hence direct anon/authenticated access is denied.
revoke all on public.retirement_invitations from anon, authenticated;
revoke all on public.retirement_rsvps from anon, authenticated;

-- Atomic submission: the row lock prevents conflicting changes to the same invitation.
-- The endpoint calls it with the service-role key, never from the browser.
create or replace function public.submit_retirement_rsvp(
 p_code_hash text, p_full_name text, p_email text, p_attendance text,
 p_guest_count integer, p_message text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare inv public.retirement_invitations%rowtype;
begin
 select * into inv from public.retirement_invitations
 where code_hash = p_code_hash and is_active = true for update;
 if not found then return jsonb_build_object('ok',false,'reason','invalid_code'); end if;
 if p_attendance not in ('yes','no') or
    (p_attendance = 'yes' and (p_guest_count < 1 or p_guest_count > inv.max_guests)) or
    (p_attendance = 'no' and p_guest_count <> 0) then
    return jsonb_build_object('ok',false,'reason','guest_limit');
 end if;
 insert into public.retirement_rsvps (invitation_id,full_name,email,attendance,guest_count,message)
 values (inv.id,p_full_name,p_email,p_attendance,p_guest_count,p_message)
 on conflict (invitation_id) do update set
 full_name=excluded.full_name,email=excluded.email,attendance=excluded.attendance,
 guest_count=excluded.guest_count,message=excluded.message,updated_at=now();
 return jsonb_build_object('ok',true,'maxGuests',inv.max_guests);
end; $$;
revoke all on function public.submit_retirement_rsvp(text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.submit_retirement_rsvp(text,text,text,text,integer,text) to service_role;
-- RSVP totals for organizers (use Supabase SQL editor):
-- select attendance, count(*) as responses, sum(guest_count) as attendees from public.retirement_rsvps group by attendance;
