-- Run as postgres against a DISPOSABLE local/staging Supabase database AFTER the
-- migration: psql "$HQ_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
-- All fixtures and assertion helpers roll back. Does not upload actual binaries.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
end; $$;
create function pg_temp.expect_error(statement text, expected_code text, message text) returns void
language plpgsql as $$ begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_code then return; end if;
    raise exception 'FAIL: % (expected %, got %: %)', message, expected_code, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (statement unexpectedly succeeded)', message;
end; $$;

insert into auth.users(id,email,aud,role,created_at) values
('f1000000-0000-0000-0000-000000000001','owner@hq-test.invalid','authenticated','authenticated',now()),
('f1000000-0000-0000-0000-000000000002','member@hq-test.invalid','authenticated','authenticated',now()),
('f1000000-0000-0000-0000-000000000003','outsider@hq-test.invalid','authenticated','authenticated',now());
insert into public.workspaces(id,name) values
('f2000000-0000-0000-0000-000000000001','Test workspace A'),
('f2000000-0000-0000-0000-000000000002','Test workspace B');
insert into public.workspace_members(workspace_id,user_id,name,role) values
('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','Test owner','owner'),
('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002','Test collaborator','collaborator'),
('f2000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001','Test owner','owner');
insert into public.accounts(id,workspace_id,name) values
('f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','Account A'),
('f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002','Account B');

select pg_temp.assert_true(not public, 'bucket is private') from storage.buckets where id='hq-media';
select pg_temp.assert_true(count(*) = 7, 'RLS enabled on all 7 application tables')
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('workspaces','workspace_members','accounts','weekly_visions','content_posts','post_comments','media_assets')
and c.relrowsecurity;
select pg_temp.assert_true(not has_table_privilege('authenticated','public.workspace_members','INSERT'), 'no member self-enrolment grant');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.workspace_members','UPDATE'), 'no member self-promotion grant');
select pg_temp.assert_true(not has_table_privilege('anon','public.content_posts','SELECT'), 'anon cannot read posts');
select pg_temp.assert_true(not has_function_privilege('anon','hq_private.is_owner(uuid)','EXECUTE'), 'anon cannot call owner helper');
select pg_temp.assert_true(not exists(select 1 from pg_proc p join pg_namespace n on p.pronamespace=n.oid
  where n.nspname='public' and p.prosecdef), 'no public SECURITY DEFINER endpoints');

set local role anon;
select pg_temp.expect_error('select * from public.workspaces', '42501', 'anonymous workspace access');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='hq-media'), 'anonymous cannot read private storage');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000003","role":"authenticated","user_metadata":{"role":"owner"}}',true);
select pg_temp.assert_true((select count(*)=0 from public.workspaces), 'outsider cannot see a workspace');
select pg_temp.assert_true((select count(*)=0 from public.workspace_members), 'outsider cannot enumerate members');
select pg_temp.assert_true(not hq_private.is_owner('f2000000-0000-0000-0000-000000000001'), 'forged user metadata does not grant ownership');
select pg_temp.expect_error($q$insert into public.workspace_members(workspace_id,user_id,name,role)
 values ('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000003','Intruder','owner')$q$,
 '42501','outsider cannot self-enrol');

select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.weekly_visions(workspace_id,week_start,text)
values ('f2000000-0000-0000-0000-000000000001','2026-10-26','Owner vision');
insert into public.content_posts(id,workspace_id,account_id,title,responsible_id,status) values
('f4000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','Shared draft','f1000000-0000-0000-0000-000000000002','draft'),
('f4000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','Approved post','f1000000-0000-0000-0000-000000000002','approved'),
('f4000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000002','Other tenant','f1000000-0000-0000-0000-000000000001','draft');
insert into public.media_assets(workspace_id,object_path,name,mime_type,size_bytes) values
('f2000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002/f1000000-0000-0000-0000-000000000001/other.png','other.png','image/png',100);
select pg_temp.assert_true((select approved_by='f1000000-0000-0000-0000-000000000001' from public.content_posts where id='f4000000-0000-0000-0000-000000000002'), 'owner approval is attributed server-side');
select pg_temp.expect_error($q$update public.content_posts set workspace_id='f2000000-0000-0000-0000-000000000002', account_id='f3000000-0000-0000-0000-000000000002' where id='f4000000-0000-0000-0000-000000000001'$q$,
 '42501','multi-workspace owner cannot move existing post between tenants');

select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=1 from public.workspaces), 'collaborator sees only their workspace');
select pg_temp.assert_true((select count(*)=2 from public.workspace_members), 'collaborator sees team but no other tenant');
select pg_temp.assert_true((select count(*)=2 from public.content_posts), 'collaborator sees shared posts only');
select pg_temp.assert_true((select text='Owner vision' from public.weekly_visions), 'collaborator can read owner vision');
update public.weekly_visions set text='Unauthorized';
select pg_temp.assert_true((select text='Owner vision' from public.weekly_visions), 'collaborator vision update changes zero rows');
select pg_temp.expect_error($q$insert into public.weekly_visions(workspace_id,week_start,text) values ('f2000000-0000-0000-0000-000000000001','2026-11-02','Unauthorized')$q$, '42501','collaborator cannot create vision');
select pg_temp.expect_error($q$update public.workspace_members set role='owner' where user_id='f1000000-0000-0000-0000-000000000002'$q$,'42501','collaborator cannot self-promote');
update public.content_posts set caption='Collaborative edit' where id='f4000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select caption='Collaborative edit' from public.content_posts where id='f4000000-0000-0000-0000-000000000001'), 'shared draft edit succeeds');
select pg_temp.expect_error($q$update public.content_posts set status='approved' where id='f4000000-0000-0000-0000-000000000001'$q$,'42501','collaborator cannot approve');
select pg_temp.expect_error($q$update public.content_posts set status='published' where id='f4000000-0000-0000-0000-000000000001'$q$,'42501','collaborator cannot publish');
update public.content_posts set caption='Tamper' where id='f4000000-0000-0000-0000-000000000002';
delete from public.content_posts where id='f4000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((select caption='' and status='approved' from public.content_posts where id='f4000000-0000-0000-0000-000000000002'), 'approved post cannot be edited or deleted by collaborator');
select pg_temp.expect_error($q$update public.content_posts set created_by='f1000000-0000-0000-0000-000000000002' where id='f4000000-0000-0000-0000-000000000001'$q$,'42501','creator cannot be changed');
select pg_temp.expect_error($q$update public.content_posts set account_id='f3000000-0000-0000-0000-000000000002' where id='f4000000-0000-0000-0000-000000000001'$q$,'23503','cross-tenant account reference denied');
select pg_temp.expect_error($q$update public.content_posts set media_path='f2000000-0000-0000-0000-000000000002/f1000000-0000-0000-0000-000000000001/other.png',media_type='image',media_name='other.png' where id='f4000000-0000-0000-0000-000000000001'$q$,'23503','cross-tenant media reference denied');
select pg_temp.expect_error($q$insert into public.content_posts(workspace_id,account_id,title,responsible_id,status) values ('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','Bypass approval','f1000000-0000-0000-0000-000000000002','approved')$q$,'42501','collaborator cannot create pre-approved post');
select pg_temp.expect_error($q$update public.content_posts set responsible_id='f1000000-0000-0000-0000-000000000003' where id='f4000000-0000-0000-0000-000000000001'$q$,'23514','responsible person must be member');
insert into public.post_comments(workspace_id,post_id,body) values ('f2000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000002','Review comment');
select pg_temp.expect_error($q$insert into public.post_comments(workspace_id,post_id,author_id,body) values ('f2000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','Impersonated')$q$,'42501','comment author spoof denied');
select pg_temp.expect_error($q$insert into public.post_comments(workspace_id,post_id,body) values ('f2000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000003','Cross tenant')$q$,'23503','cross-tenant comment denied');

insert into storage.objects(bucket_id,name) values ('hq-media','f2000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000002/test-image.png');
insert into public.media_assets(workspace_id,object_path,name,mime_type,size_bytes) values
('f2000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000002/test-image.png','test-image.png','image/png',100);
update public.content_posts set media_path='f2000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000002/test-image.png', media_type='image',media_name='test-image.png' where id='f4000000-0000-0000-0000-000000000001';
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values ('hq-media','f2000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000001/impersonated.png')$q$,'42501','upload to another user folder denied');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values ('hq-media','f2000000-0000-0000-0000-000000000002/f1000000-0000-0000-0000-000000000002/other.png')$q$,'42501','upload to another tenant denied');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values ('hq-media','not-a-uuid/user/payload.png')$q$,'42501','malformed object path safely rejected');
update storage.objects set name='tampered.png' where bucket_id='hq-media';
delete from storage.objects where bucket_id='hq-media';
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='hq-media'), 'uploaded object cannot be overwritten or deleted by collaborator');
select pg_temp.expect_error($q$update public.media_assets set name='tampered' where name='test-image.png'$q$,'42501','media metadata immutable');

-- A signed-in outsider never inherits access from user-editable claims.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000003","role":"authenticated","user_metadata":{"role":"owner"}}',true);
select pg_temp.assert_true((select count(*)=0 from public.content_posts), 'outsider cannot read posts');
select pg_temp.assert_true((select count(*)=0 from public.post_comments), 'outsider cannot read comments');
select pg_temp.assert_true((select count(*)=0 from public.media_assets), 'outsider cannot read media metadata');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='hq-media'), 'outsider cannot read media objects');

-- Membership revocation takes effect immediately without JWT refresh.
reset role;
delete from public.workspace_members where user_id='f1000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.content_posts), 'revoked member immediately loses access');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='hq-media'), 'revoked member immediately loses storage access');
reset role;
rollback;
select 'HQ security assertions passed; all fixtures rolled back.' as result;
