-- Isolated fixtures only. Never run as an unreviewed production smoke test.
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

select pg_temp.assert_true((select count(*)=0 from hq_private.signup_invitations),'migration seeds no invitations');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='hq_private.signup_invitations'::regclass),'private invitations have RLS enabled');
select pg_temp.assert_true(not has_table_privilege('anon','hq_private.signup_invitations','SELECT'),'anonymous cannot enumerate invitations');
select pg_temp.assert_true(not has_table_privilege('authenticated','hq_private.signup_invitations','SELECT'),'members cannot enumerate invitations');
select pg_temp.assert_true(not has_table_privilege('service_role','hq_private.signup_invitations','SELECT'),'ordinary service credential cannot enumerate invitations');
select pg_temp.assert_true(not has_function_privilege('anon','hq_private.before_user_created(jsonb)','EXECUTE'),'anonymous cannot invoke signup hook');
select pg_temp.assert_true(not has_function_privilege('authenticated','hq_private.before_user_created(jsonb)','EXECUTE'),'members cannot invoke signup hook');
select pg_temp.assert_true(not has_function_privilege('service_role','hq_private.before_user_created(jsonb)','EXECUTE'),'ordinary service credential cannot invoke signup hook');
select pg_temp.assert_true(has_function_privilege('supabase_auth_admin','hq_private.before_user_created(jsonb)','EXECUTE'),'Supabase Auth can invoke hook');
select pg_temp.assert_true((select not prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='hq_private.before_user_created(jsonb)'::regprocedure),'hook is invoker with fixed empty search path');

set local role supabase_auth_admin;
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":"invited@hq3-test.invalid","app_metadata":{"provider":"google"},"is_anonymous":false}}')->'error'->>'http_code')='403','empty allowlist denies signup');
reset role;
insert into hq_private.signup_invitations(email,expires_at,revoked_at) values
('invited@hq3-test.invalid',now()+interval '1 day',null),
('expired@hq3-test.invalid',now()-interval '1 day',null),
('revoked@hq3-test.invalid',now()+interval '1 day',now());
set local role supabase_auth_admin;
select pg_temp.assert_true(hq_private.before_user_created('{"user":{"email":"invited@hq3-test.invalid","app_metadata":{"provider":"google"},"is_anonymous":false}}')='{}'::jsonb,'active exact invitation allows Google signup');
select pg_temp.assert_true(hq_private.before_user_created('{"user":{"email":"  INVITED@HQ3-TEST.INVALID  ","app_metadata":{"provider":"google"},"is_anonymous":false}}')='{}'::jsonb,'email matching is case normalized');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":"outsider@hq3-test.invalid","app_metadata":{"provider":"google"},"is_anonymous":false}}')->'error'->>'http_code')='403','same-domain outsider remains denied');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":"invited+other@hq3-test.invalid","app_metadata":{"provider":"google"},"is_anonymous":false}}')->'error'->>'http_code')='403','email aliases do not inherit invitations');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":"expired@hq3-test.invalid","app_metadata":{"provider":"google"},"is_anonymous":false}}')->'error'->>'http_code')='403','expired invitation denied');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":"revoked@hq3-test.invalid","app_metadata":{"provider":"google"},"is_anonymous":false}}')->'error'->>'http_code')='403','revoked invitation denied');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":"invited@hq3-test.invalid","app_metadata":{"provider":"email"},"is_anonymous":false}}')->'error'->>'http_code')='403','password signup denied even for invited email');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":"invited@hq3-test.invalid","app_metadata":{"provider":"google"},"is_anonymous":true}}')->'error'->>'http_code')='403','anonymous signup denied');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":"invited@hq3-test.invalid","user_metadata":{"provider":"google","role":"owner"},"is_anonymous":false}}')->'error'->>'http_code')='403','editable metadata cannot spoof provider or role');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":"invited@hq3-test.invalid","app_metadata":{"provider":"google"},"is_anonymous":"false"}}')->'error'->>'http_code')='403','malformed anonymous flag denied');
select pg_temp.assert_true((hq_private.before_user_created('{}')->'error'->>'http_code')='403','missing user denied');
select pg_temp.assert_true((hq_private.before_user_created(null)->'error'->>'http_code')='403','null event denied');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":42,"app_metadata":{"provider":"google"},"is_anonymous":false}}')->'error'->>'http_code')='403','non-string email denied');
select pg_temp.assert_true((hq_private.before_user_created('{"user":{"email":" ","app_metadata":{"provider":"google"},"is_anonymous":false}}')->'error'->>'http_code')='403','empty email denied');
select pg_temp.assert_true(hq_private.before_user_created('{"user":{"email":"invited@hq3-test.invalid","email_confirmed_at":null,"app_metadata":{"provider":"google"},"is_anonymous":false}}')='{}'::jsonb,'signup eligibility is distinct from later verified workspace membership');
select pg_temp.expect_error($q$insert into hq_private.signup_invitations(email,expires_at) values ('new@hq3-test.invalid',now()+interval '1 day')$q$,'42501','Auth hook role cannot grant invitations');
select pg_temp.expect_error($q$update hq_private.signup_invitations set expires_at=now()+interval '10 days'$q$,'42501','Auth hook role cannot extend invitations');
select pg_temp.expect_error($q$delete from hq_private.signup_invitations$q$,'42501','Auth hook role cannot delete invitations');
reset role;
select pg_temp.assert_true((select count(*)=0 from auth.users),'hook does not provision Auth accounts');
select pg_temp.assert_true((select count(*)=0 from public.workspace_members),'hook does not grant workspace roles');
select pg_temp.assert_true((select count(*)=3 from hq_private.signup_invitations),'hook does not consume or mutate invitations');
set local role authenticated;
select pg_temp.expect_error($q$select * from hq_private.signup_invitations$q$,'42501','member direct invitation read denied');
select pg_temp.expect_error($q$insert into hq_private.signup_invitations(email,expires_at) values ('self@hq3-test.invalid',now()+interval '1 day')$q$,'42501','member cannot self-invite');
select pg_temp.expect_error($q$select hq_private.before_user_created('{}')$q$,'42501','member direct hook invocation denied');
reset role;
rollback;
select 'Private registration hook assertions passed; fixtures rolled back.' as result;
