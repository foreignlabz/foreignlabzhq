-- Local development preparation only. Applying this migration does NOT enable
-- the Supabase Auth hook. An authorized admin must review and enable it separately.
-- No email invitations, Auth users, or workspace memberships are seeded.
begin;

create table hq_private.signup_invitations (
  email text primary key check (
    email = lower(btrim(email)) and char_length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table hq_private.signup_invitations enable row level security;
revoke all on hq_private.signup_invitations from public, anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema hq_private to supabase_auth_admin;
grant select on hq_private.signup_invitations to supabase_auth_admin;
create policy signup_invitations_auth_read on hq_private.signup_invitations
for select to supabase_auth_admin using (true);

-- Supabase's documented before-user-created JSONB contract. The caller is Auth,
-- not an end user. This hook admits signup only; verification and workspace access
-- are separate, and no role is read from or written to the incoming payload.
create function hq_private.before_user_created(event jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  candidate_email text;
  denied jsonb := jsonb_build_object('error', jsonb_build_object(
    'http_code',403,'message','Private workspace. An active invitation is required.'
  ));
begin
  if jsonb_typeof(event) is distinct from 'object'
    or jsonb_typeof(event->'user') is distinct from 'object'
    or jsonb_typeof(event->'user'->'email') is distinct from 'string'
    or event->'user'->'app_metadata'->>'provider' is distinct from 'google'
    or event->'user'->'is_anonymous' is distinct from 'false'::jsonb then
    return denied;
  end if;
  candidate_email := lower(btrim(event->'user'->>'email'));
  if candidate_email = '' or not exists (
    select 1 from hq_private.signup_invitations invitation
    where invitation.email = candidate_email
      and invitation.revoked_at is null and invitation.expires_at > now()
  ) then
    return denied;
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function hq_private.before_user_created(jsonb) from public, anon, authenticated, service_role, supabase_auth_admin;
grant execute on function hq_private.before_user_created(jsonb) to supabase_auth_admin;
commit;
