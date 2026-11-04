# Re-entry — Architecture and Mapping Plan

This document explains how the Atomic CRM codebase we started from is built, what that means for Re-entry, and how we map it onto `docs/PHASE1_BRIEF.md`. Read it before changing the database or the data layer.

## 1. How Atomic CRM is built

| Layer | What it is | Where |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite, ra-core (headless react-admin) with shadcn-admin-kit and shadcn/ui | `src/` |
| Data access | `ra-data-postgrest` talking to Supabase's PostgREST API, plus custom methods | `src/components/atomic-crm/providers/supabase/dataProvider.ts` |
| Auth | Supabase Auth; the app's "user profile" is the `sales` table, kept in sync with `auth.users` by triggers | `supabase/schemas/02_functions.sql`, `04_triggers.sql` |
| Database | Postgres. **Declarative schema** in `supabase/schemas/` is the source of truth; migrations in `supabase/migrations/` are generated with `npx supabase db diff` | `supabase/` |
| Server code | Deno edge functions running with the **service role** (bypasses RLS) | `supabase/functions/` |
| Demo mode | FakeRest in-browser provider with generated data | `src/components/atomic-crm/providers/fakerest/` |

Key facts:

- Views (`contacts_summary`, `companies_summary`, `activity_log`) use `security_invoker = on`, so they respect the caller's row-level security. Good.
- `global_search` and `merge_contacts` run as the caller (not `SECURITY DEFINER`), so they also respect RLS. Good.
- Triggers auto-fill `sales_id` from the logged-in user on insert. We copy that pattern for `organisation_id`.
- The repo ships an optional "agent harness" under `.claude/` (multi-agent workflow). It is opt-in and off by default; we are not using it.

## 2. What the starting code gets wrong for Re-entry

Atomic CRM is a **single-team** CRM. Every finding below is a problem for a multi-tenant service handling special-category health data.

| # | Finding | Severity | Fixed in |
|---|---|---|---|
| F1 | Every RLS policy is `using (true)`: any logged-in user can read and write every row. There is no concept of an organisation. | Critical | **Session 1** |
| F2 | The `users` edge function lets any admin edit **any** user by id, including changing their email: an admin in one organisation could take over an account in another. | Critical | **Session 1** |
| F3 | Self-signup is open and the first user to sign up becomes admin (`handle_new_user`). In a SaaS that lets anyone create an account. | High | **Session 1** (blocked in the database) |
| F4 | `configuration` is a single global row editable by any admin, so one organisation's admin would change settings for everyone. | High | **Session 1** (made per-organisation) |
| F5 | Foreign keys don't check organisation, so a row could point at another organisation's record (for example a note attached to someone else's contact). | High | **Session 1** (composite foreign keys) |
| F6 | The `attachments` storage bucket is **public**: anyone with a file's URL can download it without logging in, and any logged-in user can list every file. | Critical | **Session 2** (needs signed URLs in the frontend) |
| F7 | Saving a contact sends a hash of their email to **gravatar.com** and their email domain to **favicon.show** (US services). That breaches the UK/EU residency rule. | High | **Session 3** (new `service_users` table has no such trigger; contacts are retired) |
| F8 | `contacts.tags` and `deals.contact_ids` are arrays of ids with no foreign key, so they can hold ids from another organisation. RLS still hides the other organisation's rows, so nothing leaks, but the data is untidy. | Low | Retired with the CRM tables in Session 3 |
| F9 | The `delete_note_attachments` edge function accepts any signed-in user's token and deletes whatever storage paths it is given, in any organisation. | High | **Session 2**, with the storage fix (F6) |
| F10 | The `postmark` inbound-email function writes contacts and notes with the service role. After Session 1 those writes fail (no organisation to stamp), so it fails closed; it must be removed or tenant-scoped before deployment. | Medium | **Session 2** |

**Until F6 and F7 are fixed, do not upload files or put any real-looking contact emails into the CRM screens.** Phase 1 is synthetic data only anyway.

## 3. Tenancy design (Session 1)

### Tables

- `organisations` — the tenant (`id uuid`, `name`, `created_at`).
- `memberships` — `user_id` ↔ `organisation_id` ↔ `role` (`org_admin`, `clinical_lead`, `key_worker`, `viewer`).
  - **One organisation per user** for now (`unique (user_id)`). This keeps "which organisation am I acting in?" unambiguous with no organisation switcher in the UI. The schema can relax this later by dropping the constraint and adding an "active organisation" claim.

### Helper functions (`private` schema, not exposed through the API)

- `private.current_organisation_id()` — the caller's organisation, or `NULL` if they have none.
- `private.current_membership_role()` — the caller's role in that organisation.
- `public.is_admin()` — now means "caller is `org_admin` of their organisation" (kept for existing policies and the frontend).

These are `SECURITY DEFINER` with an empty `search_path`, so they can read `memberships` without being blocked by its own RLS and can't be hijacked by objects in other schemas.

### Every tenant-owned table

- Gets `organisation_id uuid not null`, defaulting to `private.current_organisation_id()`, so the existing frontend keeps working unchanged: inserts are stamped with the caller's organisation automatically.
- Gets one RLS rule: rows are visible and writable only when `organisation_id = private.current_organisation_id()`. A user with no membership sees nothing and can write nothing.
- References to other tenant rows use **composite foreign keys** `(parent_id, organisation_id) → parent(id, organisation_id)`, so the database itself refuses cross-organisation links, even for the service role.

Tables covered in Session 1: `sales`, `companies`, `contacts`, `contact_notes`, `deals`, `deal_notes`, `tags`, `tasks`, `configuration`. `favicons_excluded_domains` stays shared reference data (a list of webmail domains): every signed-in user can read it, only the service role can change it. These are the CRM tables that exist today; making them tenant-safe now means the running app is safe throughout Phase 1, even though most will be retired in Session 3.

### Users and organisations

- New users get their organisation from `raw_app_meta_data.organisation_id` (and optionally `role`), which only the service role can set. `raw_user_meta_data` is user-editable and is never trusted for this.
- `handle_new_user` runs as a **deferred constraint trigger** (at commit), because Supabase Auth inserts the user first and writes `app_metadata` in a second statement.
- A new auth user with no organisation in their app metadata is **rejected** by the `handle_new_user` trigger. That closes open signup (F3) at the database level, whatever the Auth settings say.
- The `users` edge function puts invited users into the inviting admin's organisation, and refuses to read or change users in another organisation (F2).
- The first organisation and its first admin are created by an operator script using the service role (`scripts/create-organisation.mjs`, see `CLAUDE.md`), not through the app.

### Roles in Session 1

Session 1 only builds the organisation boundary. Roles are stored on `memberships` now; Session 2 enforces them (key workers see only assigned service users, viewers see aggregates only). Until then, `sales.administrator` is kept in step with `memberships.role` by a trigger so the existing admin screens still work. Session 2 removes `sales.administrator` and makes `memberships.role` the only source.

## 4. Mapping the CRM onto the brief

| Atomic CRM | Re-entry | Plan |
|---|---|---|
| `sales` | Staff profile (key workers, leads, admins) | **Keep**, tenant-scoped (Session 1); role moves to `memberships` (Session 2) |
| `configuration` | Per-organisation settings and branding | **Keep**, one row per organisation (Session 1) |
| `contacts` | Service users | **Replace** with a new `service_users` table (Session 3). Contacts carry sales baggage (companies, newsletter, gravatar lookups, merge logic) that we don't want near health data. |
| `contact_notes`, `tasks` | Case notes and actions | **Rebuild** against `service_users` in Session 3 if the screens need them; the Phase 1 screens don't require them. |
| `companies`, `deals`, `deal_notes`, `tags` | — | **Retire**: hide the screens in Session 4, drop the tables once nothing references them. |
| `activity_log` view | Activity feed | **Replace** with the `activity_events` table from the brief (Session 3). |
| Dashboard | Live Control Tower | **Replace** (Session 4). |
| Edge functions `users`, `update_password` | Staff management | **Keep**, tenant-scoped (Session 1). |
| Edge functions `postmark`, `mcp`, `merge_contacts`, `delete_note_attachments` | — | **Disable** before any real deployment; review in Session 2. `mcp` lets an AI client run SQL and must not ship to production. |

## 5. Testing approach

- **Database tests** use pgTAP, run with `npx supabase test db` (or `make test-db`) against the local Supabase stack. They live in `supabase/tests/`. Each test impersonates real users by setting `role authenticated` and the JWT `sub` claim, which is exactly how requests arrive through the API.
- The tenancy suite (`supabase/tests/tenancy_isolation.test.sql`) creates two organisations with users and data, then proves, for every tenant table, that a user in one organisation can't select, insert, update or delete the other organisation's rows, and can't create cross-organisation links.
- Frontend and edge-function unit tests stay on Vitest (`make test`).

## 6. Running it locally

```bash
make install
npx supabase start          # needs Docker
npx supabase test db        # database tests, including tenancy isolation
make test                   # frontend + edge function unit tests
```
