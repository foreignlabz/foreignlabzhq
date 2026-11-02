-- HQ v2: explicit grants + tenant RLS. Apply as the project database administrator.
-- No account auto-enrolment, no client membership writes, no authorization claims.
begin;

create schema if not exists hq_private;
revoke all on schema hq_private from public, anon, authenticated;
grant usage on schema hq_private to authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  role text not null check (role in ('owner', 'collaborator')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members(user_id, workspace_id);

-- These are the ONLY SECURITY DEFINER helpers. They expose a boolean for the
-- caller's own identity, never accept a user ID, never mutate, use fixed paths,
-- and live outside the API schemas. This avoids recursive membership RLS.
create function hq_private.is_member(target_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace and m.user_id = (select auth.uid())
  );
$$;
create function hq_private.is_owner(target_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target_workspace and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;
revoke all on function hq_private.is_member(uuid), hq_private.is_owner(uuid) from public, anon, authenticated, service_role;
grant execute on function hq_private.is_member(uuid), hq_private.is_owner(uuid) to authenticated;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  handle text not null default '' check (char_length(handle) <= 100),
  color text not null default '#7488FF' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique(workspace_id, id)
);
create table public.weekly_visions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  text text not null default '' check (char_length(text) <= 20000),
  updated_at timestamptz not null default now(),
  unique(workspace_id, week_start)
);
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  object_path text not null unique,
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  name text not null check (char_length(name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  created_at timestamptz not null default now(),
  unique(workspace_id, object_path),
  check (split_part(object_path, '/', 1) = workspace_id::text),
  check (split_part(object_path, '/', 2) = uploaded_by::text),
  check (object_path ~ '^[^/]+/[^/]+/[^/]+$' and object_path !~ '(^|/)\.\.(/|$)')
);
create index media_assets_uploaded_by_idx on public.media_assets(uploaded_by);
create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  caption text not null default '' check (char_length(caption) <= 10000),
  scheduled_at timestamptz,
  responsible_id uuid not null references auth.users(id),
  status text not null default 'idea' check (status in ('idea','draft','in_review','approved','published')),
  media_path text,
  media_type text check (media_type in ('image','video')),
  media_name text check (char_length(media_name) <= 255),
  video_url text not null default '' check (video_url = '' or (video_url ~ '^https://' and char_length(video_url) <= 2048)),
  created_by uuid not null default auth.uid() references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, id),
  foreign key (workspace_id, account_id) references public.accounts(workspace_id, id),
  foreign key (workspace_id, media_path) references public.media_assets(workspace_id, object_path),
  check ((media_path is null and media_type is null and media_name is null) or
    (media_path is not null and media_type is not null and media_name is not null)),
  check ((status in ('approved','published') and approved_by is not null and approved_at is not null) or
    (status not in ('approved','published') and approved_by is null and approved_at is null))
);
create index content_posts_workspace_schedule_idx on public.content_posts(workspace_id, scheduled_at);
create index content_posts_account_idx on public.content_posts(workspace_id, account_id);
create index content_posts_media_idx on public.content_posts(workspace_id, media_path) where media_path is not null;
create index content_posts_responsible_idx on public.content_posts(responsible_id);
create index content_posts_created_by_idx on public.content_posts(created_by);
create index content_posts_approved_by_idx on public.content_posts(approved_by) where approved_by is not null;
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users(id),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, post_id) references public.content_posts(workspace_id, id) on delete cascade
);
create index post_comments_post_idx on public.post_comments(workspace_id, post_id, created_at);
create index post_comments_author_idx on public.post_comments(author_id);

-- Invoker triggers defend immutable tenant/identity columns even when an account
-- belongs to multiple workspaces. Clients cannot forge audit fields.
create function hq_private.guard_post() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
      or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'Post identity and workspace are immutable' using errcode = '42501';
    end if;
    if old.status in ('approved','published') and not hq_private.is_owner(old.workspace_id) then
      raise exception 'Only an owner can change approved or published content' using errcode = '42501';
    end if;
  else
    if new.created_by is distinct from (select auth.uid()) then
      raise exception 'Cannot impersonate post creator' using errcode = '42501';
    end if;
    new.created_at := now();
  end if;
  if not exists (select 1 from public.workspace_members m
      where m.workspace_id = new.workspace_id and m.user_id = new.responsible_id) then
    raise exception 'Responsible user must be a workspace member' using errcode = '23514';
  end if;
  if new.status in ('approved','published') then
    if not hq_private.is_owner(new.workspace_id) then
      raise exception 'Only an owner can approve or publish' using errcode = '42501';
    end if;
    new.approved_by := (select auth.uid());
    new.approved_at := now();
  else
    new.approved_by := null;
    new.approved_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_content_post before insert or update on public.content_posts
for each row execute function hq_private.guard_post();

create function hq_private.guard_vision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
      or new.week_start is distinct from old.week_start) then
    raise exception 'Vision identity and week are immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_weekly_vision before insert or update on public.weekly_visions
for each row execute function hq_private.guard_vision();
revoke all on function hq_private.guard_post(), hq_private.guard_vision() from public, anon, authenticated, service_role;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.accounts enable row level security;
alter table public.weekly_visions enable row level security;
alter table public.content_posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.media_assets enable row level security;

-- Explicit table grants work with both pre/post October 2026 API defaults.
revoke all on public.workspaces, public.workspace_members, public.accounts, public.weekly_visions,
  public.content_posts, public.post_comments, public.media_assets from public, anon, authenticated;
grant select on public.workspaces, public.workspace_members, public.accounts, public.weekly_visions,
  public.content_posts, public.post_comments, public.media_assets to authenticated;
grant insert, update, delete on public.weekly_visions, public.content_posts to authenticated;
grant insert, delete on public.post_comments, public.media_assets to authenticated;
-- Accounts and memberships are administrator-managed in v1; no self-enrolment API.

create policy workspace_read on public.workspaces for select to authenticated
using ((select hq_private.is_member(id)));
create policy members_read on public.workspace_members for select to authenticated
using ((select hq_private.is_member(workspace_id)));
create policy accounts_read on public.accounts for select to authenticated
using ((select hq_private.is_member(workspace_id)));
create policy vision_read on public.weekly_visions for select to authenticated
using ((select hq_private.is_member(workspace_id)));
create policy vision_create on public.weekly_visions for insert to authenticated
with check ((select hq_private.is_owner(workspace_id)));
create policy vision_update on public.weekly_visions for update to authenticated
using ((select hq_private.is_owner(workspace_id))) with check ((select hq_private.is_owner(workspace_id)));
create policy vision_delete on public.weekly_visions for delete to authenticated
using ((select hq_private.is_owner(workspace_id)));
create policy posts_read on public.content_posts for select to authenticated
using ((select hq_private.is_member(workspace_id)));
create policy posts_create on public.content_posts for insert to authenticated
with check ((select hq_private.is_member(workspace_id)) and created_by = (select auth.uid())
  and (status not in ('approved','published') or (select hq_private.is_owner(workspace_id))));
create policy posts_update on public.content_posts for update to authenticated
using ((select hq_private.is_member(workspace_id)) and
  (status not in ('approved','published') or (select hq_private.is_owner(workspace_id))))
with check ((select hq_private.is_member(workspace_id)) and
  (status not in ('approved','published') or (select hq_private.is_owner(workspace_id))));
create policy posts_delete on public.content_posts for delete to authenticated
using ((select hq_private.is_member(workspace_id)) and
  (status not in ('approved','published') or (select hq_private.is_owner(workspace_id))));
create policy comments_read on public.post_comments for select to authenticated
using ((select hq_private.is_member(workspace_id)));
create policy comments_create on public.post_comments for insert to authenticated
with check ((select hq_private.is_member(workspace_id)) and author_id = (select auth.uid()));
create policy comments_delete on public.post_comments for delete to authenticated
using ((select hq_private.is_member(workspace_id)) and
  (author_id = (select auth.uid()) or (select hq_private.is_owner(workspace_id))));
create policy media_read on public.media_assets for select to authenticated
using ((select hq_private.is_member(workspace_id)));
create policy media_create on public.media_assets for insert to authenticated
with check ((select hq_private.is_member(workspace_id)) and uploaded_by = (select auth.uid()));
create policy media_delete on public.media_assets for delete to authenticated
using ((select hq_private.is_owner(workspace_id)));

-- Private, bounded media. Use upload(..., { upsert: false }) then createSignedUrl
-- with a short lifetime. Existing signed URLs remain valid until expiry.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('hq-media','hq-media',false,26214400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm']);

-- Avoid UUID casts on attacker-controlled paths. No UPDATE policy: immutable
-- paths prevent collaborators replacing binaries after owner approval.
create policy hq_media_read on storage.objects for select to authenticated
using (bucket_id = 'hq-media' and exists (
  select 1 from public.workspace_members m
  where m.user_id = (select auth.uid()) and m.workspace_id::text = split_part(storage.objects.name,'/',1)
));
create policy hq_media_upload on storage.objects for insert to authenticated
with check (bucket_id = 'hq-media' and split_part(name,'/',2) = (select auth.uid())::text
  and name ~ '^[^/]+/[^/]+/[^/]+$' and name !~ '(^|/)\.\.(/|$)'
  and exists (select 1 from public.workspace_members m
    where m.user_id = (select auth.uid()) and m.workspace_id::text = split_part(storage.objects.name,'/',1)));
create policy hq_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'hq-media' and exists (
  select 1 from public.workspace_members m where m.user_id = (select auth.uid())
  and m.role = 'owner' and m.workspace_id::text = split_part(storage.objects.name,'/',1)
));
commit;
