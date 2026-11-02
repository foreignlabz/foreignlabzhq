-- HQ 3.0 additive development migration. Review before any hosted application.
-- Preserves the historical schema/data, existing collaborators, and Storage files.
-- Does not provision users, alter Auth providers, or assign any privileged role.
begin;

alter table public.workspace_members drop constraint workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check
  check (role in ('owner','manager','brand_member','collaborator'));

-- Identity-bound helpers require a confirmed identity and current membership.
-- Private registration/provider settings must also be configured by an authorized admin.
create or replace function hq_private.is_member(target_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = target_workspace and m.user_id = (select auth.uid())
      and u.email_confirmed_at is not null
  );
$$;
create or replace function hq_private.is_owner(target_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = target_workspace and m.user_id = (select auth.uid())
      and m.role = 'owner' and u.email_confirmed_at is not null
  );
$$;
create function hq_private.is_editor(target_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = target_workspace and m.user_id = (select auth.uid())
      and m.role in ('owner','manager','collaborator') and u.email_confirmed_at is not null
  );
$$;
revoke all on function hq_private.is_editor(uuid) from public, anon, authenticated, service_role;
grant execute on function hq_private.is_editor(uuid) to authenticated;

-- Replacing permissive write policies is essential: a second restrictive-looking
-- policy would OR with the old member policy and still permit brand-member writes.
drop policy posts_create on public.content_posts;
create policy posts_create on public.content_posts for insert to authenticated
with check ((select hq_private.is_editor(workspace_id)) and created_by = (select auth.uid())
  and (status not in ('approved','published') or (select hq_private.is_owner(workspace_id))));
drop policy posts_update on public.content_posts;
create policy posts_update on public.content_posts for update to authenticated
using ((select hq_private.is_editor(workspace_id)) and
  (status not in ('approved','published') or (select hq_private.is_owner(workspace_id))))
with check ((select hq_private.is_editor(workspace_id)) and
  (status not in ('approved','published') or (select hq_private.is_owner(workspace_id))));
drop policy posts_delete on public.content_posts;
create policy posts_delete on public.content_posts for delete to authenticated
using ((select hq_private.is_editor(workspace_id)) and
  (status not in ('approved','published') or (select hq_private.is_owner(workspace_id))));
drop policy comments_create on public.post_comments;
create policy comments_create on public.post_comments for insert to authenticated
with check ((select hq_private.is_editor(workspace_id)) and author_id = (select auth.uid()));
drop policy comments_delete on public.post_comments;
create policy comments_delete on public.post_comments for delete to authenticated
using ((select hq_private.is_editor(workspace_id)) and
  (author_id = (select auth.uid()) or (select hq_private.is_owner(workspace_id))));
drop policy media_create on public.media_assets;
create policy media_create on public.media_assets for insert to authenticated
with check ((select hq_private.is_editor(workspace_id)) and uploaded_by = (select auth.uid()));

drop policy hq_media_read on storage.objects;
create policy hq_media_read on storage.objects for select to authenticated
using (bucket_id = 'hq-media' and exists (
  select 1 from public.workspace_members m where m.user_id = (select auth.uid())
    and m.workspace_id::text = split_part(storage.objects.name,'/',1)
    and hq_private.is_member(m.workspace_id)
));
drop policy hq_media_upload on storage.objects;
create policy hq_media_upload on storage.objects for insert to authenticated
with check (bucket_id = 'hq-media' and split_part(name,'/',2) = (select auth.uid())::text
  and name ~ '^[^/]+/[^/]+/[^/]+$' and name !~ '(^|/)\.\.(/|$)'
  and exists (select 1 from public.workspace_members m
    where m.user_id = (select auth.uid()) and m.workspace_id::text = split_part(storage.objects.name,'/',1)
      and hq_private.is_editor(m.workspace_id)));
drop policy hq_media_delete on storage.objects;
create policy hq_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'hq-media' and exists (
  select 1 from public.workspace_members m where m.user_id = (select auth.uid())
    and m.workspace_id::text = split_part(storage.objects.name,'/',1)
    and hq_private.is_owner(m.workspace_id)
));

-- Empty account_ids means the historical single account_id remains authoritative.
alter table public.content_posts add column account_ids uuid[] not null default '{}';
alter table public.content_posts add column notes text not null default '' check (char_length(notes) <= 10000);
create function hq_private.guard_hq3_post_fields() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if cardinality(new.account_ids) > 0 then
    if cardinality(new.account_ids) > 10 or array_ndims(new.account_ids) <> 1
      or not (new.account_id = any(new.account_ids))
      or cardinality(new.account_ids) <> (select count(distinct account_id) from unnest(new.account_ids) as x(account_id))
      or exists (select 1 from unnest(new.account_ids) as x(account_id)
        where not exists (select 1 from public.accounts a where a.id = x.account_id and a.workspace_id = new.workspace_id)) then
      raise exception 'Collaborative accounts must be distinct workspace accounts and include the primary account' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function hq_private.guard_hq3_post_fields() from public, anon, authenticated, service_role;
create trigger guard_hq3_post_fields before insert or update on public.content_posts
for each row execute function hq_private.guard_hq3_post_fields();

-- Progress is intentionally separate from editorial content and approval fields.
-- A manager can update an approved post's task progress without changing its content.
create table public.content_post_progress (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid not null,
  progress text not null default 'not_started' check (progress in ('not_started','in_progress','done')),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, post_id),
  foreign key (workspace_id, post_id) references public.content_posts(workspace_id, id) on delete cascade
);
create index content_post_progress_updated_by_idx on public.content_post_progress(updated_by);
alter table public.content_post_progress enable row level security;
revoke all on public.content_post_progress from public, anon, authenticated;
grant select, insert, update on public.content_post_progress to authenticated;
create policy progress_read on public.content_post_progress for select to authenticated
using ((select hq_private.is_member(workspace_id)));
create policy progress_create on public.content_post_progress for insert to authenticated
with check ((select hq_private.is_editor(workspace_id)) and updated_by = (select auth.uid()));
create policy progress_update on public.content_post_progress for update to authenticated
using ((select hq_private.is_editor(workspace_id)))
with check ((select hq_private.is_editor(workspace_id)) and updated_by = (select auth.uid()));
create function hq_private.guard_progress() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.workspace_id is distinct from old.workspace_id or new.post_id is distinct from old.post_id) then
    raise exception 'Progress identity and workspace are immutable' using errcode = '42501';
  end if;
  if new.updated_by is distinct from (select auth.uid()) then
    raise exception 'Cannot impersonate progress author' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function hq_private.guard_progress() from public, anon, authenticated, service_role;
create trigger guard_content_post_progress before insert or update on public.content_post_progress
for each row execute function hq_private.guard_progress();
commit;
