-- Disposable/local database only. Uses isolated synthetic users and rolls back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
end; $$;
create function pg_temp.expect_error(statement text, expected_code text, message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if sqlstate = expected_code then return; end if;
    raise exception 'FAIL: % (expected %, got %: %)', message, expected_code, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (statement unexpectedly succeeded)', message;
end; $$;
insert into auth.users(id,email,aud,role,created_at,email_confirmed_at) values
('e1000000-0000-0000-0000-000000000001','owner@hq3-test.invalid','authenticated','authenticated',now(),now()),
('e1000000-0000-0000-0000-000000000002','manager@hq3-test.invalid','authenticated','authenticated',now(),now()),
('e1000000-0000-0000-0000-000000000003','brand@hq3-test.invalid','authenticated','authenticated',now(),now()),
('e1000000-0000-0000-0000-000000000004','outsider@hq3-test.invalid','authenticated','authenticated',now(),now()),
('e1000000-0000-0000-0000-000000000005','unverified@hq3-test.invalid','authenticated','authenticated',now(),null);
insert into public.workspaces(id,name) values
('e2000000-0000-0000-0000-000000000001','HQ3 A'),
('e2000000-0000-0000-0000-000000000002','HQ3 B');
insert into public.workspace_members(workspace_id,user_id,name,role) values
('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','Owner','owner'),
('e2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001','Owner','owner'),
('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','Manager','manager'),
('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','Brand','brand_member'),
('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000005','Unverified owner','owner');
insert into public.accounts(id,workspace_id,name) values
('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','Account A1'),
('e3000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','Account A2'),
('e3000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000002','Account B1');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.content_posts(id,workspace_id,account_id,title,responsible_id,status) values
('e4000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','Draft','e1000000-0000-0000-0000-000000000002','draft'),
('e4000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','Approved','e1000000-0000-0000-0000-000000000002','approved'),
('e4000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000002','e3000000-0000-0000-0000-000000000003','Other tenant','e1000000-0000-0000-0000-000000000001','draft');
-- Simulate a comment created before its author's downgrade to read-only.
insert into public.post_comments(id,workspace_id,post_id,author_id,body) values
('e5000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','Historical comment');
insert into storage.objects(bucket_id,name) values ('hq-media','e2000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/original.png');
insert into public.media_assets(workspace_id,object_path,name,mime_type,size_bytes) values
('e2000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/original.png','original.png','image/png',100);

select pg_temp.assert_true(not has_table_privilege('authenticated','public.workspace_members','UPDATE'),'new roles cannot promote themselves');
select pg_temp.assert_true(not has_table_privilege('anon','public.content_post_progress','SELECT'),'anonymous progress denied');
select pg_temp.assert_true(not has_function_privilege('anon','hq_private.is_editor(uuid)','EXECUTE'),'editor helper not exposed to anonymous');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true(hq_private.is_editor('e2000000-0000-0000-0000-000000000001'),'manager is an editor');
update public.content_posts set caption='Manager caption',notes='Review sequence',account_ids=array['e3000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000002']::uuid[] where id='e4000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select caption='Manager caption' and notes='Review sequence' and cardinality(account_ids)=2 from public.content_posts where id='e4000000-0000-0000-0000-000000000001'),'manager edits draft and valid collaborative accounts');
select pg_temp.expect_error($q$update public.content_posts set account_ids=array['e3000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000003']::uuid[] where id='e4000000-0000-0000-0000-000000000001'$q$,'23514','cross-tenant collaborative account denied');
select pg_temp.expect_error($q$update public.content_posts set account_ids=array['e3000000-0000-0000-0000-000000000002']::uuid[] where id='e4000000-0000-0000-0000-000000000001'$q$,'23514','primary account must remain included');
select pg_temp.expect_error($q$update public.content_posts set account_ids=array['e3000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001']::uuid[] where id='e4000000-0000-0000-0000-000000000001'$q$,'23514','duplicate collaborative account denied');
select pg_temp.expect_error($q$update public.content_posts set status='approved' where id='e4000000-0000-0000-0000-000000000001'$q$,'42501','manager cannot approve');
update public.content_posts set caption='Tamper' where id='e4000000-0000-0000-0000-000000000002';
delete from public.content_posts where id='e4000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((select caption='' and status='approved' from public.content_posts where id='e4000000-0000-0000-0000-000000000002'),'manager cannot modify/delete approved content');
insert into public.content_post_progress(workspace_id,post_id,progress) values ('e2000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000002','in_progress');
update public.content_post_progress set progress='done' where post_id='e4000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((select progress='done' and updated_by='e1000000-0000-0000-0000-000000000002' from public.content_post_progress),'manager updates progress for approved post');
select pg_temp.assert_true((select status='approved' and caption='' and approved_by='e1000000-0000-0000-0000-000000000001' from public.content_posts where id='e4000000-0000-0000-0000-000000000002'),'progress preserves content and owner approval');
select pg_temp.expect_error($q$update public.content_post_progress set progress='published'$q$,'23514','invalid progress denied');
select pg_temp.expect_error($q$update public.content_post_progress set updated_by='e1000000-0000-0000-0000-000000000001'$q$,'42501','progress author spoof denied');
select pg_temp.expect_error($q$update public.content_post_progress set post_id='e4000000-0000-0000-0000-000000000001'$q$,'42501','progress identity immutable');
select pg_temp.expect_error($q$insert into public.content_post_progress(workspace_id,post_id,progress) values ('e2000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000003','done')$q$,'23503','cross-tenant progress association denied');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000003","role":"authenticated","user_metadata":{"role":"owner"}}',true);
select pg_temp.assert_true(hq_private.is_member('e2000000-0000-0000-0000-000000000001') and not hq_private.is_editor('e2000000-0000-0000-0000-000000000001'),'brand member reads but cannot become editor via metadata');
select pg_temp.assert_true((select count(*)=2 from public.content_posts),'brand reads only its workspace');
select pg_temp.assert_true((select count(*)=1 from public.content_post_progress),'brand reads progress');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'brand reads private workspace media');
select pg_temp.expect_error($q$insert into public.content_posts(workspace_id,account_id,title,responsible_id,status) values ('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001','Denied','e1000000-0000-0000-0000-000000000003','draft')$q$,'42501','brand cannot create draft');
update public.content_posts set caption='Brand edit',notes='Brand notes',scheduled_at=now() where id='e4000000-0000-0000-0000-000000000001';
delete from public.content_posts where id='e4000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select caption='Manager caption' and notes='Review sequence' and scheduled_at is null from public.content_posts where id='e4000000-0000-0000-0000-000000000001'),'brand cannot edit/schedule/delete draft');
select pg_temp.expect_error($q$insert into public.post_comments(workspace_id,post_id,body) values ('e2000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','Denied')$q$,'42501','brand cannot comment');
delete from public.post_comments where author_id='e1000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select count(*)=1 from public.post_comments),'brand cannot delete even its historical comment');
select pg_temp.expect_error($q$insert into public.content_post_progress(workspace_id,post_id,progress) values ('e2000000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','done')$q$,'42501','brand cannot create progress');
update public.content_post_progress set progress='not_started',updated_by='e1000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select progress='done' from public.content_post_progress),'brand cannot update progress');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values ('hq-media','e2000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000003/new.png')$q$,'42501','brand cannot upload binary');
select pg_temp.expect_error($q$insert into public.media_assets(workspace_id,object_path,name,mime_type,size_bytes) values ('e2000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000003/new.png','new.png','image/png',100)$q$,'42501','brand cannot create media metadata');
delete from public.media_assets;
delete from storage.objects;
select pg_temp.assert_true((select count(*)=1 from public.media_assets) and (select count(*)=1 from storage.objects),'brand cannot delete media metadata or originals');
select pg_temp.expect_error($q$update public.workspace_members set role='owner' where user_id='e1000000-0000-0000-0000-000000000003'$q$,'42501','brand cannot promote role');
select pg_temp.expect_error($q$insert into public.weekly_visions(workspace_id,week_start,text) values ('e2000000-0000-0000-0000-000000000001','2026-11-02','Denied')$q$,'42501','brand cannot write vision');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select pg_temp.assert_true(not hq_private.is_member('e2000000-0000-0000-0000-000000000001') and not hq_private.is_owner('e2000000-0000-0000-0000-000000000001') and not hq_private.is_editor('e2000000-0000-0000-0000-000000000001'),'unverified owner denied by every identity helper');
select pg_temp.assert_true((select count(*)=0 from public.content_posts) and (select count(*)=0 from storage.objects),'unverified identity cannot read posts or private media');
select pg_temp.expect_error($q$insert into public.weekly_visions(workspace_id,week_start,text) values ('e2000000-0000-0000-0000-000000000001','2026-11-02','Denied')$q$,'42501','unverified owner cannot write vision');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.content_post_progress),'outsider cannot read progress');
reset role;
delete from public.workspace_members where user_id='e1000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.content_post_progress) and not hq_private.is_editor('e2000000-0000-0000-0000-000000000001'),'revoked manager immediately loses progress access');
reset role;
rollback;
select 'HQ3 role, verification, collaboration, and progress security assertions passed; fixtures rolled back.' as result;
