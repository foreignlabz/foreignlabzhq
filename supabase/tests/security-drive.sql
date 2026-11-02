-- Local disposable database only; fixtures are rolled back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end; $$;
create function pg_temp.expect_error(statement text, expected_code text, message text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate=expected_code then return; end if;
    raise exception 'FAIL: % (expected %, got %)',message,expected_code,sqlstate;
  end;
  raise exception 'FAIL: % (unexpected success)',message;
end; $$;
insert into auth.users(id,email,email_confirmed_at) values
('d1000000-0000-0000-0000-000000000001','owner@drive.invalid',now()),
('d1000000-0000-0000-0000-000000000002','brand@drive.invalid',now()),
('d1000000-0000-0000-0000-000000000003','outsider@drive.invalid',now()),
('d1000000-0000-0000-0000-000000000004','unverified@drive.invalid',null);
insert into public.workspaces(id,name) values ('d2000000-0000-0000-0000-000000000001','Drive A'),('d2000000-0000-0000-0000-000000000002','Drive B');
insert into public.workspace_members(workspace_id,user_id,name,role) values
('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','Owner','owner'),
('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','Brand','brand_member'),
('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000004','Unverified','owner');
insert into public.hq_drive_assets(id,workspace_id,uploaded_by,name,mime_type,size_bytes,state,drive_file_id) values
('d3000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','large.mp4','video/mp4',33554432,'complete','original-A'),
('d3000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','other.jpg','image/jpeg',100,'complete','original-B');
select pg_temp.assert_true(not has_table_privilege('anon','public.hq_drive_assets','SELECT'),'anonymous media denied');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.hq_drive_assets','INSERT'),'clients cannot forge Drive identifiers');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.hq_drive_assets','UPDATE'),'clients cannot replace verified Drive identifiers');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.hq_drive_post_media','INSERT'),'associations pass through server permission checks');
select pg_temp.assert_true(not has_table_privilege('service_role','public.hq_drive_assets','DELETE'),'server cannot delete original metadata');
select pg_temp.assert_true(has_table_privilege('service_role','public.hq_drive_post_media','DELETE'),'server can unlink associations');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=1 from public.hq_drive_assets),'read-only member sees only own workspace');
select pg_temp.expect_error($q$update public.hq_drive_assets set drive_file_id='forged'$q$,'42501','read-only cannot replace files');
select pg_temp.expect_error($q$delete from public.hq_drive_assets$q$,'42501','read-only cannot delete media');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=1 from public.hq_drive_assets),'owner cannot read another workspace');
select pg_temp.expect_error($q$update public.hq_drive_assets set drive_file_id='forged'$q$,'42501','owner client cannot bypass verified server metadata');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.hq_drive_assets),'outsider reads no media');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.hq_drive_assets),'unverified owner reads no media');
reset role;
select pg_temp.expect_error($q$update public.hq_drive_assets set state='pending' where drive_file_id='original-A'$q$,'23514','state and file identity remain consistent');
rollback;
select 'Drive metadata security assertions passed; originals preserved and fixtures rolled back.' as result;
