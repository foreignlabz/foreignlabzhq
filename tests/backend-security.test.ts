import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationDir = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationDir).filter(name => name.endsWith('.sql'));
const sql = migrationFiles.map(name => readFileSync(join(migrationDir, name), 'utf8')).join('\n');
const tables = ['workspaces', 'workspace_members', 'accounts', 'weekly_visions', 'content_posts', 'post_comments', 'media_assets'];

test('backend migrations are versioned and all exposed application tables enable RLS', () => {
  assert.ok(migrationFiles.length > 0);
  for (const name of migrationFiles) assert.match(name, /^\d{14}_[a-z0-9_]+\.sql$/);
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});

test('backend authorization is live membership-based, never user-editable JWT metadata', () => {
  assert.doesNotMatch(sql, /(?:raw_user_meta_data|user_metadata|auth\.jwt\s*\()/i);
  assert.match(sql, /m\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /m\.role = 'owner'/);
  assert.doesNotMatch(sql, /create policy\s+\w+\s+on public\.workspace_members for (?:insert|update|delete|all)/i);
});

test('backend definer helpers stay private, identity-bound, and explicitly granted', () => {
  const functions = [...sql.matchAll(/create(?: or replace)? function\s+([^\s(]+)\([^]*?\$\$;/g)];
  const definers=functions.filter(([definition])=>/security definer/i.test(definition));
  assert.deepEqual([...new Set(definers.map(([,name])=>name))].sort(), ['hq_private.is_editor','hq_private.is_member','hq_private.is_owner']);
  for (const [definition, name] of definers) {
    assert.ok(name.startsWith('hq_private.'));
    assert.match(definition,/security definer set search_path = ''/);
    assert.match(definition,/auth\.uid\(\)/);
  }
  assert.match(sql, /revoke all on function hq_private\.is_member\(uuid\), hq_private\.is_owner\(uuid\) from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function hq_private\.is_member\(uuid\), hq_private\.is_owner\(uuid\) to authenticated/);
});

test('backend blocks approval forgery, tenant movement, and post creator impersonation', () => {
  assert.match(sql, /old\.status in \('approved','published'\) and not hq_private\.is_owner/);
  assert.match(sql, /Only an owner can approve or publish/);
  assert.match(sql, /new\.workspace_id is distinct from old\.workspace_id/);
  assert.match(sql, /new\.created_by is distinct from old\.created_by/);
  assert.match(sql, /new\.approved_by := \(select auth\.uid\(\)\)/);
});

test('backend references scope accounts, comments, and media to the same workspace', () => {
  assert.match(sql, /foreign key \(workspace_id, account_id\) references public\.accounts\(workspace_id, id\)/);
  assert.match(sql, /foreign key \(workspace_id, post_id\) references public\.content_posts\(workspace_id, id\)/);
  assert.match(sql, /foreign key \(workspace_id, media_path\) references public\.media_assets\(workspace_id, object_path\)/);
});

test('private storage is bounded, tenant-scoped, and immutable', () => {
  assert.match(sql, /values \('hq-media','hq-media',false,26214400/);
  assert.match(sql, /split_part\(name,'\/',2\) = \(select auth\.uid\(\)\)::text/);
  assert.match(sql, /m\.workspace_id::text = split_part\(storage\.objects\.name,'\/',1\)/);
  assert.doesNotMatch(sql, /create policy \w+ on storage\.objects for (?:update|all)/i);
});

test('SQL role-switch verification is transactionally rolled back and covers revocation', () => {
  const verification = readFileSync(join(process.cwd(), 'supabase/tests/security.sql'), 'utf8');
  assert.match(verification, /set local role anon/);
  assert.match(verification, /set local role authenticated/);
  assert.match(verification, /revoked member immediately loses access/);
  assert.match(verification, /cross-tenant comment denied/);
  assert.match(verification, /collaborator cannot self-promote/);
  assert.match(verification, /rollback;/);
});


test('HQ3 migration adds confirmed identities, read-only enforcement, and separate progress storage',()=>{
  const upgrade=readFileSync(join(migrationDir,'20261102170000_hq3_roles_progress.sql'),'utf8');
  assert.match(upgrade,/u\.email_confirmed_at is not null/);
  assert.match(upgrade,/m\.role in \('owner','manager','collaborator'\)/);
  for(const policy of ['posts_create','posts_update','posts_delete','comments_create','comments_delete','media_create','hq_media_upload'])assert.match(upgrade,new RegExp(`drop policy ${policy} on`));
  assert.match(upgrade,/alter table public\.content_post_progress enable row level security/);
  assert.match(upgrade,/foreign key \(workspace_id, post_id\) references public\.content_posts/);
  assert.doesNotMatch(upgrade,/insert into (?:auth\.users|public\.workspace_members)/i);
});
