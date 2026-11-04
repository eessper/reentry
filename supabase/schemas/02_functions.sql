--
-- Functions
-- This file declares all PL/pgSQL functions in the public schema.
--

CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("email" "text") RETURNS TABLE("id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = $1;
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  app_metadata jsonb;
  new_organisation_id uuid;
  new_role public.membership_role;
begin
  -- Runs as a deferred constraint trigger, at commit: Auth inserts the user
  -- first and writes app_metadata in a second statement, so the row is
  -- re-read here instead of trusting NEW.
  select u.raw_app_meta_data into app_metadata
  from auth.users u
  where u.id = new.id;

  -- The organisation comes from app metadata, which only the service role can
  -- set. User metadata is editable by the user and is never trusted for this.
  -- No organisation means the whole sign-up is rolled back: there is no
  -- self-signup into Re-entry.
  new_organisation_id := nullif(app_metadata ->> 'organisation_id', '')::uuid;
  if new_organisation_id is null then
    raise exception 'New users must be created with an organisation in app_metadata.organisation_id'
      using errcode = 'P0001';
  end if;

  new_role := coalesce(nullif(app_metadata ->> 'role', ''), 'key_worker')::public.membership_role;

  insert into public.memberships (organisation_id, user_id, role)
  values (new_organisation_id, new.id, new_role);

  insert into public.sales (first_name, last_name, email, user_id, organisation_id)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    new_organisation_id
  );
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_organisation_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.configuration (organisation_id) values (new.id);
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_update_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.sales
  set
    first_name = coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    last_name = coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    email = new.email
  where user_id = new.id;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.memberships
    where user_id = auth.uid() and role = 'org_admin'
  );
end;
$$;
