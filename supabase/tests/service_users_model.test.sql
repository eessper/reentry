-- Service user data model tests.
--
-- The rules the database applies by itself, whoever writes the data: the
-- derived programme day, the support profile each service user gets, profile
-- versioning, escalation timestamps and the value constraints.
--
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into public.organisations (id, name) values
    ('a0000000-0000-0000-0000-000000000000', 'Alpha'),
    ('b0000000-0000-0000-0000-000000000000', 'Bravo');

insert into public.service_users (id, display_name, reference_code, release_date, organisation_id) values
    (9001, 'Released Today', 'RE-90001', current_date, 'a0000000-0000-0000-0000-000000000000'),
    (9002, 'Released Last Week', 'RE-90002', current_date - 7, 'a0000000-0000-0000-0000-000000000000');

-------------------------------------------------------------------------------
-- Programme day and the cohort view
-------------------------------------------------------------------------------

select results_eq(
    $$select id, programme_day from public.service_users_summary order by id$$,
    $$values (9001::bigint, 1), (9002::bigint, 8)$$,
    'programme_day is 1 on the day of release and counts up from there');

insert into public.escalations (service_user_id, trigger_type, severity, status, organisation_id) values
    (9002, 'keyword', 'high', 'open', 'a0000000-0000-0000-0000-000000000000'),
    (9002, 'missed_checkins', 'medium', 'acknowledged', 'a0000000-0000-0000-0000-000000000000'),
    (9002, 'sentiment_dip', 'low', 'resolved', 'a0000000-0000-0000-0000-000000000000');
select is((select nb_open_escalations from public.service_users_summary where id = 9002), 2::bigint,
    'nb_open_escalations counts open and acknowledged escalations, not resolved ones');

-------------------------------------------------------------------------------
-- Reference codes
-------------------------------------------------------------------------------

select throws_ok(
    $$insert into public.service_users (display_name, reference_code, release_date, organisation_id)
      values ('Bad Code', 'RE-12', current_date, 'a0000000-0000-0000-0000-000000000000')$$,
    '23514', null, 'reference codes must look like RE-12345');
select throws_ok(
    $$insert into public.service_users (display_name, reference_code, release_date, organisation_id)
      values ('Duplicate', 'RE-90001', current_date, 'a0000000-0000-0000-0000-000000000000')$$,
    '23505', null, 'reference codes are unique within an organisation');
select lives_ok(
    $$insert into public.service_users (display_name, reference_code, release_date, organisation_id)
      values ('Same Code Elsewhere', 'RE-90001', current_date, 'b0000000-0000-0000-0000-000000000000')$$,
    'another organisation can use the same reference code');

-------------------------------------------------------------------------------
-- Support profiles
-------------------------------------------------------------------------------

select results_eq(
    $$select checkin_frequency::text, sentiment_dip_days::int, missed_checkins_threshold::int, keyword_sensitivity::int, version, organisation_id
      from public.support_profiles where service_user_id = 9001$$,
    $$values ('daily', 3, 2, 5, 1, 'a0000000-0000-0000-0000-000000000000'::uuid)$$,
    'every new service user gets a default profile in their organisation');
select throws_ok(
    $$insert into public.support_profiles (service_user_id, organisation_id) values (9001, 'a0000000-0000-0000-0000-000000000000')$$,
    '23505', null, 'a service user has only one profile');

update public.support_profiles set primary_risk_pathway = 'substance_use' where service_user_id = 9001;
update public.support_profiles set active_cbt_module = 'urge_surfing' where service_user_id = 9001;
select is((select version from public.support_profiles where service_user_id = 9001), 3,
    'each change to a profile is a new version');
update public.support_profiles set version = 1 where service_user_id = 9001;
select is((select version from public.support_profiles where service_user_id = 9001), 4,
    'the version can''t be set back by hand: every update moves it on');

select throws_ok($$update public.support_profiles set keyword_sensitivity = 11 where service_user_id = 9001$$, '23514', null,
    'keyword sensitivity is between 1 and 10');
select throws_ok($$update public.support_profiles set missed_checkins_threshold = 0 where service_user_id = 9001$$, '23514', null,
    'the missed check-ins threshold is at least 1');
select throws_ok($$update public.support_profiles set sentiment_dip_days = 30 where service_user_id = 9001$$, '23514', null,
    'sentiment dip days are between 1 and 14');

-------------------------------------------------------------------------------
-- Escalations
-------------------------------------------------------------------------------

insert into public.escalations (id, service_user_id, trigger_type, severity, organisation_id)
    values (9010, 9001, 'self_referral', 'critical', 'a0000000-0000-0000-0000-000000000000');
update public.escalations set status = 'resolved' where id = 9010;
select ok(
    (select acknowledged_at is not null and resolved_at is not null from public.escalations where id = 9010),
    'resolving an escalation stamps when it was acknowledged and resolved');
update public.escalations set status = 'open' where id = 9010;
select ok(
    (select resolved_at is null from public.escalations where id = 9010),
    'reopening an escalation clears its resolved time');
insert into public.escalations (id, service_user_id, trigger_type, severity, status, resolved_at, organisation_id)
    values (9011, 9001, 'manual', 'low', 'open', now(), 'a0000000-0000-0000-0000-000000000000');
select ok((select resolved_at is null from public.escalations where id = 9011),
    'an open escalation never keeps a resolved time, even if one is sent');

-------------------------------------------------------------------------------
-- Removing a service user
-------------------------------------------------------------------------------

insert into public.activity_events (service_user_id, type, summary, organisation_id)
    values (9002, 'checkin', 'Checked in', 'a0000000-0000-0000-0000-000000000000');
delete from public.service_users where id = 9002;
select is(
    (select count(*) from public.support_profiles where service_user_id = 9002)
      + (select count(*) from public.escalations where service_user_id = 9002)
      + (select count(*) from public.activity_events where service_user_id = 9002),
    0::bigint,
    'removing a service user removes their profile, escalations and activity (the audit log keeps the history)');
select ok(
    exists (select 1 from public.audit_log where table_name = 'support_profiles' and action = 'delete' and (before ->> 'service_user_id')::bigint = 9002),
    'the cascaded deletes are in the audit log');

select * from finish();
rollback;
