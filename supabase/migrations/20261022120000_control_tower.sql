-- Session 4: what the Control Tower and profile screens read.
--
-- Hand-written like the earlier migrations; it must leave the database
-- identical to supabase/schemas/ (check with
-- `npx supabase db diff --local --use-pg-schema`).
--
-- - service_user_stability(): the stable / watch / critical status dot, and
--   two new service_users_summary columns (stability, last_checkin_at).
-- - control_tower_stats(): KPI cards and the 7-day stability chart as
--   aggregates only, so viewers can see them.
-- - service_user_history(): the profile's Audit Trail panel.
-- - activity events are recorded in the name of whoever adds them.

-- Events recorded by a signed-in member are always in their name: the actor
-- can't be left empty (which reads as automated) or set to a colleague.
-- Inserts by the service role (seed, Phase 2 engine) keep what they send.
create or replace function public.stamp_activity_actor()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if auth.uid() is not null then
    new.actor_sales_id := private.current_sales_id();
  end if;
  return new;
end;
$$;

-- How a service user is doing at a point in time, for the status dots and
-- the stability chart:
--   critical  an unresolved high or critical escalation
--   watch     any other unresolved escalation, a missed check-in in the last
--             48 hours, or a high risk tier
--   stable    otherwise
-- Runs as the caller, so it only ever counts rows the caller can see.
create or replace function public.service_user_stability(service_user_id bigint, risk_tier public.risk_tier, at_time timestamp with time zone)
returns text
language sql
stable
set search_path to ''
as $$
  select case
    when exists (
      select 1 from public.escalations e
      where e.service_user_id = service_user_stability.service_user_id
        and e.severity in ('high', 'critical')
        and e.opened_at <= service_user_stability.at_time
        and (e.resolved_at is null or e.resolved_at > service_user_stability.at_time)
    ) then 'critical'
    when service_user_stability.risk_tier = 'high'
      or exists (
        select 1 from public.escalations e
        where e.service_user_id = service_user_stability.service_user_id
          and e.opened_at <= service_user_stability.at_time
          and (e.resolved_at is null or e.resolved_at > service_user_stability.at_time)
      )
      or exists (
        select 1 from public.activity_events a
        where a.service_user_id = service_user_stability.service_user_id
          and a.type = 'missed_checkin'
          and a.created_at > service_user_stability.at_time - interval '48 hours'
          and a.created_at <= service_user_stability.at_time
      ) then 'watch'
    else 'stable'
  end
$$;

create or replace trigger stamp_activity_actor
    before insert on public.activity_events
    for each row execute function public.stamp_activity_actor();

-- Service users with the derived fields the cohort list needs.
-- programme_day counts from 1 on the day of release; stability is the
-- status dot (see service_user_stability above).
create or replace view public.service_users_summary with (security_invoker = on) as
select
    su.id,
    su.organisation_id,
    su.display_name,
    su.reference_code,
    su.release_date,
    (current_date - su.release_date) + 1 as programme_day,
    su.risk_tier,
    su.assigned_worker_id,
    su.consent_status,
    su.status,
    su.created_at,
    su.updated_at,
    count(e.id) filter (where e.status <> 'resolved'::public.escalation_status) as nb_open_escalations,
    public.service_user_stability(su.id, su.risk_tier, now()) as stability,
    (
        select max(a.created_at) from public.activity_events a
        where a.service_user_id = su.id and a.type = 'checkin'::public.activity_event_type
    ) as last_checkin_at
from public.service_users su
    left join public.escalations e on e.service_user_id = su.id
group by su.id;

revoke all on function public.stamp_activity_actor() from public;
revoke all on function public.stamp_activity_actor() from anon;
revoke all on function public.service_user_stability(bigint, public.risk_tier, timestamp with time zone) from public;
revoke all on function public.service_user_stability(bigint, public.risk_tier, timestamp with time zone) from anon;
grant execute on function public.service_user_stability(bigint, public.risk_tier, timestamp with time zone) to authenticated;
grant execute on function public.service_user_stability(bigint, public.risk_tier, timestamp with time zone) to service_role;

-- KPI cards and the stability chart, as aggregates only (no individual
-- records), so viewers can have them too:
--   key workers   their own caseload
--   everyone else their whole organisation
-- SECURITY DEFINER because viewers can't read the rows being counted; it
-- scopes itself to the caller's organisation (and caseload) instead.
create or replace function public.control_tower_stats(days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  caller_organisation_id uuid := private.current_organisation_id();
  caller_role public.membership_role := private.current_membership_role();
  caseload_sales_id bigint := case when caller_role = 'key_worker' then private.current_sales_id() end;
  day_count integer := least(greatest(coalesce(days, 7), 1), 31);
  result jsonb;
begin
  if caller_organisation_id is null then
    raise exception 'Not a member of an organisation' using errcode = '42501';
  end if;

  with cohort as (
    select su.id, su.risk_tier, su.release_date
    from public.service_users su
    where su.organisation_id = caller_organisation_id
      and su.status <> 'exited'
      and (caseload_sales_id is null or su.assigned_worker_id = caseload_sales_id)
  ),
  checkins as (
    select
      count(*) filter (where a.type = 'checkin') as completed,
      count(*) filter (where a.type = 'missed_checkin') as missed
    from public.activity_events a
    where a.service_user_id in (select id from cohort)
      and a.created_at > now() - make_interval(days => day_count)
  ),
  open_escalations as (
    select
      count(*) as total,
      count(*) filter (where e.severity in ('high', 'critical')) as urgent
    from public.escalations e
    where e.service_user_id in (select id from cohort)
      and e.status <> 'resolved'
  ),
  days as (
    select (current_date - offset_days) as day
    from generate_series(day_count - 1, 0, -1) as offset_days
  ),
  stability as (
    select
      d.day,
      count(*) filter (where s.status = 'stable') as stable,
      count(*) filter (where s.status = 'watch') as watch,
      count(*) filter (where s.status = 'critical') as critical
    from days d
      left join lateral (
        select public.service_user_stability(
          c.id,
          c.risk_tier,
          least(now(), (d.day + 1)::timestamp with time zone)
        ) as status
        from cohort c
        where c.release_date <= d.day
      ) s on true
    group by d.day
  )
  select jsonb_build_object(
    'scope', case when caseload_sales_id is null then 'organisation' else 'caseload' end,
    'active_clients', (select count(*) from cohort),
    'checkins_completed', (select completed from checkins),
    'checkins_missed', (select missed from checkins),
    'checkin_adherence', (
      select case when completed + missed = 0 then null
        else round(100.0 * completed / (completed + missed)) end
      from checkins
    ),
    'open_escalations', (select total from open_escalations),
    'urgent_escalations', (select urgent from open_escalations),
    'stability', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'stable', stable, 'watch', watch, 'critical', critical) order by day)
      from stability
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- A service user's history for the profile's Audit Trail panel: changes to
-- the service user, their support profile and their escalations, plus record
-- views, newest first, with the name of whoever did it. Runs as the caller,
-- so audit_log's own policy decides what comes back.
create or replace function public.service_user_history(service_user_id bigint, max_results integer default 50)
returns table (
    id bigint,
    created_at timestamp with time zone,
    action public.audit_action,
    table_name text,
    record_id text,
    actor_name text,
    before jsonb,
    after jsonb
)
language sql
stable
set search_path to ''
as $$
  select
    l.id,
    l.created_at,
    l.action,
    l.table_name,
    l.record_id,
    coalesce(s.first_name || ' ' || s.last_name, 'System') as actor_name,
    l.before,
    l.after
  from public.audit_log l
    left join public.sales s on s.user_id = l.actor_user_id
  where (l.table_name = 'service_users' and l.record_id = service_user_history.service_user_id::text)
    or (l.table_name in ('support_profiles', 'escalations')
        and coalesce(l.after, l.before) ->> 'service_user_id' = service_user_history.service_user_id::text)
    or (l.table_name = 'support_profiles' and l.action = 'view' and l.record_id = (
        select sp.id::text from public.support_profiles sp where sp.service_user_id = service_user_history.service_user_id
    ))
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(max_results, 50), 1), 200)
$$;

revoke all on function public.control_tower_stats(integer) from public;
revoke all on function public.control_tower_stats(integer) from anon;
grant execute on function public.control_tower_stats(integer) to authenticated;
grant execute on function public.control_tower_stats(integer) to service_role;

revoke all on function public.service_user_history(bigint, integer) from public;
revoke all on function public.service_user_history(bigint, integer) from anon;
grant execute on function public.service_user_history(bigint, integer) to authenticated;
grant execute on function public.service_user_history(bigint, integer) to service_role;
