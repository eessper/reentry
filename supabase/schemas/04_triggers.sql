--
-- Triggers
-- This file declares all triggers.
--

-- Auth triggers: sync auth.users to public.sales
-- Deferred to commit so it sees the app_metadata Auth writes after the insert
create constraint trigger on_auth_user_created
    after insert on auth.users
    deferrable initially deferred
    for each row execute function public.handle_new_user();

create or replace trigger on_auth_user_updated
    after update on auth.users
    for each row execute function public.handle_update_user();

-- Every organisation gets its own configuration row
create or replace trigger on_organisation_created
    after insert on public.organisations
    for each row execute function public.handle_organisation_created();
