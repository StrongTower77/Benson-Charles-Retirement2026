-- RSVP mail outbox. Apply via Supabase migration before enabling sending in Vercel.
-- No email is dispatched by this migration; table access stays service-role only.
create table if not exists public.retirement_email_outbox (
  id uuid primary key default gen_random_uuid(),
  rsvp_id uuid not null references public.retirement_rsvps(id) on delete cascade,
  audience text not null check (audience in ('admins', 'guest')),
  event_type text not null check (event_type in ('submitted', 'updated')),
  snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  leased_until timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error_code text,
  created_at timestamptz not null default now()
);
create index if not exists retirement_email_outbox_due_idx
  on public.retirement_email_outbox (next_attempt_at, created_at)
  where status in ('pending','sending');
alter table public.retirement_email_outbox enable row level security;
revoke all on public.retirement_email_outbox from public, anon, authenticated;
grant select, insert, update on public.retirement_email_outbox to service_role;

create or replace function public.queue_retirement_rsvp_emails()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  kind text;
  payload jsonb;
begin
  if TG_OP = 'UPDATE' then
    if row(NEW.full_name,NEW.email,NEW.attendance,NEW.guest_count,NEW.message)
       is not distinct from
       row(OLD.full_name,OLD.email,OLD.attendance,OLD.guest_count,OLD.message) then
      return NEW;
    end if;
    kind := 'updated';
  else
    kind := 'submitted';
  end if;
  payload := jsonb_build_object(
    'fullName',NEW.full_name, 'email',NEW.email,
    'attendance',NEW.attendance, 'guestCount',NEW.guest_count,
    'message',NEW.message
  );
  insert into public.retirement_email_outbox (rsvp_id,audience,event_type,snapshot)
  values (NEW.id,'admins',kind,payload),(NEW.id,'guest',kind,payload);
  return NEW;
end; $$;
drop trigger if exists retirement_rsvp_queue_email on public.retirement_rsvps;
create trigger retirement_rsvp_queue_email
after insert or update on public.retirement_rsvps
for each row execute function public.queue_retirement_rsvp_emails();
revoke all on function public.queue_retirement_rsvp_emails() from public, anon, authenticated;

-- Claims are atomic, short-lived, and safe across concurrent Vercel instances.
create or replace function public.claim_retirement_email_outbox(p_limit integer default 6)
returns setof public.retirement_email_outbox
language plpgsql security invoker set search_path = public as $$
begin
  return query
  with due as (
    select id from public.retirement_email_outbox
    where (status='pending' and next_attempt_at<=now())
       or (status='sending' and leased_until<now())
    order by created_at, id
    for update skip locked
    limit least(greatest(p_limit,1),12)
  )
  update public.retirement_email_outbox o
  set status='sending',attempts=o.attempts+1,
      leased_until=now()+interval '2 minutes'
  from due
  where o.id=due.id
  returning o.*;
end; $$;
revoke all on function public.claim_retirement_email_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_retirement_email_outbox(integer) to service_role;

create or replace function public.complete_retirement_email_outbox(
  p_id uuid, p_success boolean, p_provider_id text default null, p_error_code text default null
) returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.retirement_email_outbox
  set status=case when p_success then 'sent'
                  when attempts>=5 then 'failed' else 'pending' end,
      sent_at=case when p_success then now() else null end,
      provider_id=case when p_success then left(coalesce(p_provider_id,''),128) else null end,
      last_error_code=case when p_success then null else left(coalesce(p_error_code,'send_failed'),48) end,
      next_attempt_at=case when p_success then now()
        else now()+(power(2,least(attempts,6))*interval '1 minute') end,
      leased_until=null
  where id=p_id and status='sending';
end; $$;
revoke all on function public.complete_retirement_email_outbox(uuid,boolean,text,text) from public, anon, authenticated;
grant execute on function public.complete_retirement_email_outbox(uuid,boolean,text,text) to service_role;

-- Dedicated server-side RSVP submission throttle (kept separate from unlock throttle).
-- The API hashes invitation + requester IP with its session secret; only hashes persist.
create table if not exists public.retirement_rsvp_submit_limits (
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.retirement_rsvp_submit_limits enable row level security;
revoke all on public.retirement_rsvp_submit_limits from public, anon, authenticated;
grant select, insert, update on public.retirement_rsvp_submit_limits to service_role;

create or replace function public.check_retirement_rsvp_submit_limit(p_fingerprint text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare count_now integer;
begin
  if p_fingerprint !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into public.retirement_rsvp_submit_limits(fingerprint,window_start,attempts)
  values(p_fingerprint,clock_timestamp(),1)
  on conflict (fingerprint) do update set
    attempts=case
      when retirement_rsvp_submit_limits.window_start < clock_timestamp()-interval '10 minutes' then 1
      else retirement_rsvp_submit_limits.attempts+1 end,
    window_start=case
      when retirement_rsvp_submit_limits.window_start < clock_timestamp()-interval '10 minutes' then clock_timestamp()
      else retirement_rsvp_submit_limits.window_start end
  returning attempts into count_now;
  return count_now<=12;
end; $$;
revoke all on function public.check_retirement_rsvp_submit_limit(text) from public, anon, authenticated;
grant execute on function public.check_retirement_rsvp_submit_limit(text) to service_role;
