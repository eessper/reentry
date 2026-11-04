--
-- Views
-- This file declares all views in the public schema.
--

create or replace view public.init_state with (security_invoker = off) as
select count(sub.id) as is_initialized
from (
    select sales.id from public.sales limit 1
) sub;

-- Staff profiles with their role, which lives only in memberships.
create or replace view public.sales_summary with (security_invoker = on) as
select
    s.id,
    s.first_name,
    s.last_name,
    s.email,
    s.user_id,
    s.avatar,
    s.disabled,
    s.secondary_emails,
    s.organisation_id,
    m.role
from public.sales s
    join public.memberships m on m.user_id = s.user_id;
