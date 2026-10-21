-- Control Tower tests.
--
-- The status dots (service_user_stability), the KPI and chart aggregates
-- (control_tower_stats, including that viewers get numbers but never rows),
-- the profile's audit trail (service_user_history) and the activity actor.
--
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

set constraints all immediate;

insert into public.organisations (id, name) values
    ('a0000000-0000-0000-0000-000000000000', 'Alpha'),
    ('b0000000-0000-0000-0000-000000000000', 'Bravo');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
       jsonb_build_object('first_name', first_name, 'last_name', 'Test'),
       jsonb_build_object('organisation_id', organisation_id, 'role', role),
       now(), now()
from (values
    ('a0000000-0000-0000-0000-0000000000a1', 'alice@alpha.test', 'Alice', 'a0000000-0000-0000-0000-000000000000', 'org_admin'),
    ('a0000000-0000-0000-0000-0000000000e1', 'kim@alpha.test', 'Kim', 'a0000000-0000-0000-0000-000000000000', 'key_worker'),
    ('a0000000-0000-0000-0000-0000000000e2', 'ken@alpha.test', 'Ken', 'a0000000-0000-0000-0000-000000000000', 'key_worker'),
    ('a0000000-0000-0000-0000-0000000000f1', 'vera@alpha.test', 'Vera', 'a0000000-0000-0000-0000-000000000000', 'viewer'),
    ('b0000000-0000-0000-0000-0000000000b1', 'bob@bravo.test', 'Bob', 'b0000000-0000-0000-0000-000000000000', 'org_admin')
) as u(id, email, first_name, organisation_id, role);

create temporary table ids on commit drop as
select
    (select id from public.sales where email = 'kim@alpha.test') as kim,
    (select id from public.sales where email = 'ken@alpha.test') as ken;
grant select on ids to authenticated;

-- Kim's caseload: 9001 stable, 9002 critical, 9003 watch (missed check-in),
-- 9004 watch (high risk tier). Ken has 9005 (stable). Bravo has 9101.
insert into public.service_users (id, display_name, reference_code, release_date, risk_tier, organisation_id, assigned_worker_id) values
    (9001, 'Stable Person', 'RE-90001', current_date - 20, 'low', 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9002, 'Critical Person', 'RE-90002', current_date - 20, 'moderate', 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9003, 'Watch Person', 'RE-90003', current_date - 20, 'moderate', 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9004, 'High Tier Person', 'RE-90004', current_date - 20, 'high', 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9005, 'Kens Person', 'RE-90005', current_date - 20, 'low', 'a0000000-0000-0000-0000-000000000000', (select ken from ids));
insert into public.service_users (id, display_name, reference_code, release_date, organisation_id) values
    (9101, 'Bravo Person', 'RE-91001', current_date - 20, 'b0000000-0000-0000-0000-000000000000');

insert into public.escalations (service_user_id, trigger_type, severity, status, opened_at, organisation_id) values
    (9002, 'keyword', 'critical', 'open', now() - interval '3 days', 'a0000000-0000-0000-0000-000000000000'),
    (9001, 'manual', 'high', 'resolved', now() - interval '5 days', 'a0000000-0000-0000-0000-000000000000');
update public.escalations set resolved_at = now() - interval '4 days' where service_user_id = 9001;

insert into public.activity_events (service_user_id, type, summary, created_at, organisation_id) values
    (9001, 'checkin', 'ok', now() - interval '2 hours', 'a0000000-0000-0000-0000-000000000000'),
    (9002, 'checkin', 'ok', now() - interval '1 day', 'a0000000-0000-0000-0000-000000000000'),
    (9003, 'missed_checkin', 'missed', now() - interval '20 hours', 'a0000000-0000-0000-0000-000000000000'),
    (9004, 'checkin', 'ok', now() - interval '3 days', 'a0000000-0000-0000-0000-000000000000'),
    (9005, 'checkin', 'ok', now() - interval '1 hour', 'a0000000-0000-0000-0000-000000000000');

create function pg_temp.sign_in(user_id text)
returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

-------------------------------------------------------------------------------
-- Status dots
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');

select results_eq(
    $$select id, stability from public.service_users_summary where organisation_id = 'a0000000-0000-0000-0000-000000000000' order by id$$,
    $$values (9001::bigint, 'stable'), (9002::bigint, 'critical'), (9003::bigint, 'watch'), (9004::bigint, 'watch'), (9005::bigint, 'stable')$$,
    'stability: critical with an unresolved high or critical escalation, watch after a missed check-in or on a high risk tier, stable otherwise');
select is(public.service_user_stability(9001, 'low', now() - interval '4 days 12 hours'), 'critical',
    'stability: a past point in time sees the escalation that was open then');
select ok((select last_checkin_at > now() - interval '3 hours' from public.service_users_summary where id = 9001),
    'service_users_summary: last_checkin_at is the latest completed check-in');

-------------------------------------------------------------------------------
-- KPI and chart aggregates
-------------------------------------------------------------------------------

-- Org admin: the whole organisation
select is(public.control_tower_stats() ->> 'scope', 'organisation', 'stats: an org admin sees the whole organisation');
select is((public.control_tower_stats() ->> 'active_clients')::int, 5, 'stats: active clients counts the organisation''s service users only');
select is((public.control_tower_stats() ->> 'checkin_adherence')::int, 80, 'stats: adherence is completed check-ins over all scheduled ones (4 of 5)');
select is((public.control_tower_stats() ->> 'open_escalations')::int, 1, 'stats: resolved escalations are not open');
select is((public.control_tower_stats() ->> 'urgent_escalations')::int, 1, 'stats: the open critical escalation is urgent');
select is(jsonb_array_length(public.control_tower_stats() -> 'stability'), 7, 'stats: the chart covers 7 days by default');
select is(
    (select (d ->> 'stable')::int + (d ->> 'watch')::int + (d ->> 'critical')::int
     from jsonb_array_elements(public.control_tower_stats() -> 'stability') as d
     where d ->> 'day' = current_date::text),
    5, 'stats: every active service user is counted once on today''s bar');
select is(
    (select d -> 'critical' from jsonb_array_elements(public.control_tower_stats() -> 'stability') as d
     where d ->> 'day' = current_date::text),
    '1'::jsonb, 'stats: today''s bar matches the status dots');
select is(jsonb_array_length(public.control_tower_stats(90) -> 'stability'), 31, 'stats: the chart is capped at 31 days');

-- Key worker: their caseload only
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');
select is(public.control_tower_stats() ->> 'scope', 'caseload', 'stats: a key worker sees their own caseload');
select is((public.control_tower_stats() ->> 'active_clients')::int, 4, 'stats: a key worker''s numbers leave out colleagues'' service users');

-- Viewer: aggregates for the organisation, still no rows
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000f1');
select is((public.control_tower_stats() ->> 'active_clients')::int, 5, 'stats: a viewer gets the organisation''s aggregates');
select is((select count(*) from public.service_users_summary), 0::bigint, 'stats: ...while still seeing no individual service user');

-- Another organisation and no membership
select pg_temp.sign_in('b0000000-0000-0000-0000-0000000000b1');
select is((public.control_tower_stats() ->> 'active_clients')::int, 1, 'stats: another organisation only counts its own service users');
select pg_temp.sign_in('c0000000-0000-0000-0000-0000000000c1');
select throws_ok($$select public.control_tower_stats()$$, '42501', null, 'stats: refused without a membership');

-------------------------------------------------------------------------------
-- Audit trail panel
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');
update public.support_profiles set keyword_sensitivity = 9 where service_user_id = 9001;
select public.log_record_view('service_users', 9001);

select ok(
    exists (select 1 from public.service_user_history(9001)
            where table_name = 'support_profiles' and action = 'update' and actor_name = 'Kim Test'),
    'history: shows profile changes with the name of who made them');
select ok(
    exists (select 1 from public.service_user_history(9001) where table_name = 'service_users' and action = 'view'),
    'history: shows record views');
select ok(
    exists (select 1 from public.service_user_history(9001) where table_name = 'escalations'),
    'history: shows the service user''s escalations');
select is((select count(*) from public.service_user_history(9005)), 0::bigint,
    'history: a key worker gets nothing for a colleague''s service user');

-------------------------------------------------------------------------------
-- Activity actor
-------------------------------------------------------------------------------

insert into public.activity_events (service_user_id, type, summary, actor_sales_id)
    values (9001, 'override', 'Paused nudges', (select ken from ids));
select is((select actor_sales_id from public.activity_events where summary = 'Paused nudges'), (select kim from ids),
    'activity: an event is recorded in the name of whoever adds it, whatever actor is sent');
insert into public.activity_events (service_user_id, type, summary) values (9001, 'checkin', 'Pretend automated');
select is((select actor_sales_id from public.activity_events where summary = 'Pretend automated'), (select kim from ids),
    'activity: a member cannot pass an event off as automated');

select * from finish();
rollback;
