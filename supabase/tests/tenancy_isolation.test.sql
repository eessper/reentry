-- Tenancy isolation tests.
--
-- Sets up two organisations, Alpha and Bravo, each with users and a row in
-- every tenant table, then signs in as Alpha's users and proves they can't
-- read, change, delete or link to anything belonging to Bravo.
--
-- Users are impersonated exactly as API requests arrive: `role authenticated`
-- plus a JWT `sub` claim. Everything runs in a transaction that is rolled back.
--
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

-- Deferred triggers (handle_new_user) fire at the end of each statement
-- instead of at commit, which this transaction never reaches.
set constraints all immediate;

-------------------------------------------------------------------------------
-- Fixtures (as the database owner, bypassing RLS)
-------------------------------------------------------------------------------

insert into public.organisations (id, name) values
    ('a0000000-0000-0000-0000-000000000000', 'Alpha'),
    ('b0000000-0000-0000-0000-000000000000', 'Bravo');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at) values
    ('a0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@alpha.test',
     '{"first_name": "Alice", "last_name": "Admin"}',
     '{"organisation_id": "a0000000-0000-0000-0000-000000000000", "role": "org_admin"}', now(), now()),
    ('a0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aaron@alpha.test',
     '{"first_name": "Aaron", "last_name": "Worker"}',
     '{"organisation_id": "a0000000-0000-0000-0000-000000000000"}', now(), now()),
    ('b0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@bravo.test',
     '{"first_name": "Bob", "last_name": "Admin"}',
     '{"organisation_id": "b0000000-0000-0000-0000-000000000000", "role": "org_admin"}', now(), now());

create temporary table ids on commit drop as
select
    (select id from public.sales where email = 'alice@alpha.test') as alice_sales_id,
    (select id from public.sales where email = 'aaron@alpha.test') as aaron_sales_id,
    (select id from public.sales where email = 'bob@bravo.test') as bob_sales_id;
grant select on ids to authenticated;

update public.configuration set config = '{"title": "Bravo"}' where organisation_id = 'b0000000-0000-0000-0000-000000000000';

-- Service users get their support profile from a trigger
insert into public.service_users (id, display_name, reference_code, release_date, organisation_id, assigned_worker_id) values
    (9001, 'Alpha Person', 'RE-90001', current_date - 3, 'a0000000-0000-0000-0000-000000000000', (select alice_sales_id from ids)),
    (9101, 'Bravo Person', 'RE-91001', current_date - 3, 'b0000000-0000-0000-0000-000000000000', (select bob_sales_id from ids));

insert into public.escalations (id, service_user_id, trigger_type, severity, organisation_id) values
    (9001, 9001, 'keyword', 'high', 'a0000000-0000-0000-0000-000000000000'),
    (9101, 9101, 'keyword', 'high', 'b0000000-0000-0000-0000-000000000000');

insert into public.activity_events (id, service_user_id, type, summary, organisation_id) values
    (9001, 9001, 'checkin', 'Alpha check-in', 'a0000000-0000-0000-0000-000000000000'),
    (9101, 9101, 'checkin', 'Bravo check-in', 'b0000000-0000-0000-0000-000000000000');

insert into public.case_notes (id, service_user_id, body, organisation_id) values
    (9001, 9001, 'Alpha note', 'a0000000-0000-0000-0000-000000000000'),
    (9101, 9101, 'Bravo note', 'b0000000-0000-0000-0000-000000000000');

insert into public.case_actions (id, service_user_id, title, organisation_id) values
    (9001, 9001, 'Alpha action', 'a0000000-0000-0000-0000-000000000000'),
    (9101, 9101, 'Bravo action', 'b0000000-0000-0000-0000-000000000000');

-- Runs the same five checks against one tenant table as the signed-in user.
-- `insert_into_bravo` is an INSERT that targets Bravo's organisation explicitly.
-- Tables with no update or delete grant (append-only ones) refuse with a
-- permission error instead of matching no rows; both mean "cannot".
create function pg_temp.check_isolation(tbl text, insert_into_bravo text)
returns setof text
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I where organisation_id = %L', tbl, 'a0000000-0000-0000-0000-000000000000') into n;
  return next ok(n > 0, tbl || ': Alpha user sees their own organisation''s rows');

  execute format('select count(*) from public.%I where organisation_id = %L', tbl, 'b0000000-0000-0000-0000-000000000000') into n;
  return next is(n, 0::bigint, tbl || ': Alpha user cannot read Bravo rows');

  begin
    execute format(
      'with changed as (update public.%I set organisation_id = organisation_id where organisation_id = %L returning 1) select count(*) from changed',
      tbl, 'b0000000-0000-0000-0000-000000000000') into n;
  exception when insufficient_privilege then
    n := 0;
  end;
  return next is(n, 0::bigint, tbl || ': Alpha user cannot update Bravo rows');

  begin
    execute format(
      'with removed as (delete from public.%I where organisation_id = %L returning 1) select count(*) from removed',
      tbl, 'b0000000-0000-0000-0000-000000000000') into n;
  exception when insufficient_privilege then
    n := 0;
  end;
  return next is(n, 0::bigint, tbl || ': Alpha user cannot delete Bravo rows');

  return next throws_ok(insert_into_bravo, '42501', null, tbl || ': Alpha user cannot insert rows into Bravo');
end;
$$;

-------------------------------------------------------------------------------
-- Signed in as Alice (Alpha org_admin)
-------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
set local role authenticated;

-- Every tenant table: read, update, delete and insert across the boundary (5 checks each)
select * from pg_temp.check_isolation('sales',
    $$insert into public.sales (first_name, last_name, email, user_id, organisation_id)
      values ('Sneaky', 'User', 'sneaky@bravo.test', 'a0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('service_users',
    $$insert into public.service_users (display_name, reference_code, release_date, organisation_id)
      values ('Sneaky', 'RE-99999', current_date, 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('support_profiles',
    $$insert into public.support_profiles (service_user_id, organisation_id) values (9101, 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('escalations',
    $$insert into public.escalations (service_user_id, trigger_type, severity, organisation_id)
      values (9101, 'manual', 'low', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('activity_events',
    $$insert into public.activity_events (service_user_id, type, summary, organisation_id)
      values (9101, 'checkin', 'Sneaky', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('case_notes',
    $$insert into public.case_notes (service_user_id, body, organisation_id) values (9101, 'Sneaky', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('case_actions',
    $$insert into public.case_actions (service_user_id, title, organisation_id) values (9101, 'Sneaky', 'b0000000-0000-0000-0000-000000000000')$$);

-- Moving one of your own rows into another organisation
select throws_ok(
    $$update public.service_users set organisation_id = 'b0000000-0000-0000-0000-000000000000' where id = 9001$$,
    '42501', null,
    'service_users: Alpha user cannot move their own row into Bravo');

-- New rows are stamped with the caller's organisation automatically
insert into public.case_notes (service_user_id, body) values (9001, 'stamped');
select is(
    (select organisation_id from public.case_notes where body = 'stamped'),
    'a0000000-0000-0000-0000-000000000000'::uuid,
    'case_notes: rows inserted without an organisation get the caller''s organisation');

-- Links across organisations are refused. Child rows are refused first by
-- row-level security (their service user must be visible); the composite
-- foreign keys are the backstop, checked again below as the database owner.
select throws_ok(
    $$insert into public.case_notes (service_user_id, body) values (9101, 'Linked')$$,
    '42501', null,
    'case_notes: cannot attach a note to a Bravo service user');
select throws_ok(
    $$insert into public.case_actions (service_user_id, title) values (9101, 'Linked')$$,
    '42501', null,
    'case_actions: cannot attach an action to a Bravo service user');
select throws_ok(
    format('update public.case_actions set assigned_to = %s where id = 9001', (select bob_sales_id from ids)),
    '23503', null,
    'case_actions: cannot assign a Bravo staff member to an Alpha action');
select throws_ok(
    format('update public.service_users set assigned_worker_id = %s where id = 9001', (select bob_sales_id from ids)),
    '23503', null,
    'service_users: cannot assign a Bravo staff member to an Alpha service user');

-- Views and functions only return the caller's organisation
select is(
    (select count(*) from public.service_users_summary where id = 9101), 0::bigint,
    'service_users_summary: Alpha user cannot see Bravo service users');
select is(
    (select count(*) from public.service_user_history(9101)), 0::bigint,
    'service_user_history: Alpha user cannot see a Bravo service user''s history');

-- Organisations and memberships
select results_eq(
    $$select name from public.organisations$$,
    $$values ('Alpha')$$,
    'organisations: Alpha user sees only their own organisation');
select is(
    (select count(*) from public.memberships where organisation_id = 'b0000000-0000-0000-0000-000000000000'), 0::bigint,
    'memberships: Alpha user cannot see Bravo memberships');
select is(
    (select count(*) from public.memberships), 2::bigint,
    'memberships: Alpha user sees their own organisation''s memberships');
select throws_ok(
    $$insert into public.memberships (organisation_id, user_id, role)
      values ('b0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a1', 'org_admin')$$,
    '42501', null,
    'memberships: users cannot add themselves to another organisation');
select throws_ok(
    $$update public.memberships set role = 'org_admin' where user_id = 'a0000000-0000-0000-0000-0000000000a2'$$,
    '42501', null,
    'memberships: users cannot change roles directly');
select throws_ok(
    $$insert into public.organisations (name) values ('Rogue organisation')$$,
    '42501', null,
    'organisations: users cannot create organisations');

-- Configuration: the frontend asks for id = 1 and must get its own organisation's row
select results_eq(
    $$select organisation_id from public.configuration where id = 1$$,
    $$values ('a0000000-0000-0000-0000-000000000000'::uuid)$$,
    'configuration: id = 1 resolves to the caller''s own organisation');
update public.configuration set config = '{"title": "Alpha"}' where id = 1;
select is(
    (select config ->> 'title' from public.configuration where id = 1), 'Alpha',
    'configuration: an organisation admin can update their own configuration');

select ok(public.is_admin(), 'is_admin: true for an org_admin');

-------------------------------------------------------------------------------
-- Signed in as Aaron (Alpha key_worker, not an admin)
-------------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub": "a0000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);
set local role authenticated;

select ok(not public.is_admin(), 'is_admin: false for a key_worker');
with changed as (
    update public.configuration set config = '{"title": "Hijacked"}' where id = 1 returning 1
)
select is(
    (select count(*) from changed),
    0::bigint,
    'configuration: a non-admin cannot update the configuration');

-------------------------------------------------------------------------------
-- Signed in as someone with no membership
-------------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub": "c0000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;

select is(
    (select count(*) from public.sales)
      + (select count(*) from public.configuration) + (select count(*) from public.organisations)
      + (select count(*) from public.memberships) + (select count(*) from public.service_users)
      + (select count(*) from public.support_profiles) + (select count(*) from public.escalations)
      + (select count(*) from public.activity_events) + (select count(*) from public.case_notes)
      + (select count(*) from public.case_actions) + (select count(*) from public.audit_log),
    0::bigint,
    'no membership: sees no rows in any tenant table');
select throws_ok(
    $$insert into public.service_users (display_name, reference_code, release_date) values ('Orphan', 'RE-99998', current_date)$$,
    '42501', null,
    'no membership: cannot create rows');

-------------------------------------------------------------------------------
-- Back as the database owner: Bravo's data is untouched
-------------------------------------------------------------------------------

reset role;

select is(
    (select count(*) from public.service_users where organisation_id = 'b0000000-0000-0000-0000-000000000000'), 1::bigint,
    'Bravo still has exactly its one service user');
select is(
    (select config ->> 'title' from public.configuration where organisation_id = 'b0000000-0000-0000-0000-000000000000'), 'Bravo',
    'Bravo configuration is unchanged');
select is(
    (select config ->> 'title' from public.configuration where organisation_id = 'a0000000-0000-0000-0000-000000000000'), 'Alpha',
    'Alpha configuration kept the admin''s change and not the key worker''s');

-- The composite foreign keys refuse cross-organisation links even where
-- row-level security doesn't apply (service role, triggers)
select throws_ok(
    $$insert into public.case_notes (service_user_id, body, organisation_id) values (9101, 'Linked', 'a0000000-0000-0000-0000-000000000000')$$,
    '23503', null,
    'case_notes: foreign key refuses an Alpha note on a Bravo service user, even without RLS');
select throws_ok(
    $$insert into public.case_actions (service_user_id, title, organisation_id) values (9101, 'Linked', 'a0000000-0000-0000-0000-000000000000')$$,
    '23503', null,
    'case_actions: foreign key refuses an Alpha action on a Bravo service user, even without RLS');
select throws_ok(
    $$insert into public.escalations (service_user_id, trigger_type, severity, organisation_id)
      values (9101, 'manual', 'low', 'a0000000-0000-0000-0000-000000000000')$$,
    '23503', null,
    'escalations: foreign key refuses an Alpha escalation on a Bravo service user, even without RLS');
select throws_ok(
    $$insert into public.activity_events (service_user_id, type, summary, organisation_id)
      values (9101, 'checkin', 'Linked', 'a0000000-0000-0000-0000-000000000000')$$,
    '23503', null,
    'activity_events: foreign key refuses an Alpha event on a Bravo service user, even without RLS');
select throws_ok(
    format($$update public.service_users set assigned_worker_id = %s where id = 9001$$, (select bob_sales_id from ids)),
    '23503', null,
    'service_users: foreign key refuses assigning a Bravo staff member to an Alpha service user');

-------------------------------------------------------------------------------
-- Account creation
-------------------------------------------------------------------------------

select results_eq(
    $$select m.role::text, s.organisation_id
      from public.memberships m join public.sales s on s.user_id = m.user_id
      where m.user_id = 'a0000000-0000-0000-0000-0000000000a2'$$,
    $$values ('key_worker', 'a0000000-0000-0000-0000-000000000000'::uuid)$$,
    'new user: membership and staff profile created in the organisation from app_metadata, defaulting to key_worker');

select throws_ok(
    $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
      values ('c0000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'stranger@example.test', '{"organisation_id": "a0000000-0000-0000-0000-000000000000"}', '{"provider": "email"}', now(), now())$$,
    'P0001', null,
    'self-signup: a user without an organisation in app_metadata is refused, even with one forged in user metadata');

select * from finish();
rollback;
