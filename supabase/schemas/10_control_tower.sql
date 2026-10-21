--
-- Control Tower
-- Read-only functions behind the Control Tower and profile screens.
-- Sorts after 09_audit.sql because service_user_history reads audit_log.
--

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
