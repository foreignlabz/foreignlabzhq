-- Review and apply only to an authorized isolated development database first.
-- Originals stay in Google Drive. These tables never grant public file access.
begin;
create table public.hq_drive_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  uploaded_by uuid not null references auth.users(id),
  drive_file_id text unique check (drive_file_id ~ '^[a-zA-Z0-9_-]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5368709120),
  state text not null default 'pending' check (state in ('pending','complete')),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  check ((state = 'complete') = (drive_file_id is not null))
);
create table public.hq_drive_post_media (
  workspace_id uuid not null references public.workspaces(id),
  post_id uuid not null,
  asset_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(post_id,asset_id),
  foreign key(workspace_id,post_id) references public.content_posts(workspace_id,id) on delete cascade,
  foreign key(workspace_id,asset_id) references public.hq_drive_assets(workspace_id,id)
);
alter table public.hq_drive_assets enable row level security;
alter table public.hq_drive_post_media enable row level security;
revoke all on public.hq_drive_assets, public.hq_drive_post_media from public, anon, authenticated;
grant select on public.hq_drive_assets, public.hq_drive_post_media to authenticated;
-- No caller can forge a Drive identifier through direct PostgREST writes.
-- Only the authenticated/authorized server boundary writes trusted metadata.
grant select, insert, update on public.hq_drive_assets to service_role;
grant select, insert, update, delete on public.hq_drive_post_media to service_role;
create policy drive_assets_member_read on public.hq_drive_assets for select to authenticated
  using (hq_private.is_member(workspace_id));
create policy drive_associations_member_read on public.hq_drive_post_media for select to authenticated
  using (hq_private.is_member(workspace_id));
create index hq_drive_assets_workspace_idx on public.hq_drive_assets(workspace_id,created_at desc);
create index hq_drive_associations_workspace_idx on public.hq_drive_post_media(workspace_id,post_id);
commit;
