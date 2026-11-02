-- MANUAL ADMINISTRATOR TEMPLATE. REVIEW/REPLACE UUIDS BEFORE EXECUTING.
-- Invite/create the explicitly authorized users in Supabase Auth first. Verify
-- their identities and confirmed email addresses; never copy IDs from the browser.
-- This is not a migration and must not run automatically on deploy.
begin;
do $$
declare
  owner_user_id uuid := 'REPLACE_WITH_VERIFIED_OWNER_AUTH_USER_ID'::uuid;
  new_workspace_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where id = owner_user_id and email_confirmed_at is not null) then
    raise exception 'Owner must be an existing, verified Auth user';
  end if;
  insert into public.workspaces(id,name) values (new_workspace_id,'4EIGN HQ');
  insert into public.workspace_members(workspace_id,user_id,name,role)
    values (new_workspace_id,owner_user_id,'Owner','owner');
  -- Account handles/names are workspace configuration, not OAuth connections.
  insert into public.accounts(workspace_id,name,handle,color)
    values (new_workspace_id,'4EIGN','','#7488FF');
  raise notice 'Created workspace %. Record this ID for administrator membership provisioning.',new_workspace_id;
end;
$$;
commit;

-- Add a collaborator only AFTER the owner explicitly authorizes that person.
-- Use a separate reviewed transaction; no role comes from user metadata.
-- begin;
-- insert into public.workspace_members(workspace_id,user_id,name,role)
-- select 'REPLACE_WORKSPACE_ID'::uuid,id,'REPLACE_DISPLAY_NAME','collaborator'
-- from auth.users
-- where id='REPLACE_VERIFIED_COLLABORATOR_AUTH_USER_ID'::uuid and email_confirmed_at is not null;
-- Verify exactly one row was inserted before committing.
-- commit;
