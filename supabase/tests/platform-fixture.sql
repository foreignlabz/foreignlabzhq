-- Test-only emulation of the Supabase schemas for embedded PostgreSQL (PGlite).
-- NEVER apply this fixture to a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
-- Local-only stand-in for the platform role; migrations never create this role.
create role supabase_auth_admin nologin;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key, email text, aud text, role text, created_at timestamptz, email_confirmed_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table storage.buckets(id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner_id text, unique(bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
-- Simulate legacy broad defaults; the migration must explicitly revoke them.
alter default privileges in schema public grant all on tables to anon, authenticated;
