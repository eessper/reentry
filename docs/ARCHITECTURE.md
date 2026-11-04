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
| F6 | The `attachments` storage bucket is **public**: anyone with a file's URL can download it without logging in, and any logged-in user can list every file. | Critical | **Session 2** (fixed: private bucket, organisation-scoped paths, signed URLs) |
| F7 | Saving a contact sends a hash of their email to **gravatar.com** and their email domain to **favicon.show** (US services). That breaches the UK/EU residency rule. | High | **Session 4** removed every screen that writes contacts or companies; the triggers go when the CRM tables are dropped |
| F8 | `contacts.tags` and `deals.contact_ids` are arrays of ids with no foreign key, so they can hold ids from another organisation. RLS still hides the other organisation's rows, so nothing leaks, but the data is untidy. | Low | Goes with the CRM tables (next migration) |
| F9 | The `delete_note_attachments` edge function accepts any signed-in user's token and deletes whatever storage paths it is given, in any organisation. | High | **Session 2** (fixed: it only drains a queue the database fills) |
| F10 | The `postmark` inbound-email function writes contacts and notes with the service role. After Session 1 those writes fail (no organisation to stamp), so it fails closed; it must be removed or tenant-scoped before deployment. | Medium | **Session 2** (fixed: removed) |

Until the CRM tables are dropped, do not write contacts or companies through the API. Phase 1 is synthetic data only anyway.

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

## 3b. Roles, audit log and attachments (Session 2)

### Roles

`memberships.role` is the only source of a user's role; `sales.administrator` is gone. The frontend reads roles through the `sales_summary` view, and the `users` edge function changes them (org admins only, never their own role, so an organisation can't lose its last admin by accident).

| Role | Records | Changes |
|---|---|---|
| `org_admin` | Everything in the organisation | Everything, plus organisation settings, members and roles |
| `clinical_lead` | Everything in the organisation | Records, including creating, deleting and (re)assigning contacts |
| `key_worker` | Contacts and deals whose `sales_id` is theirs, and the notes and tasks on those | Those records; can't create, delete or reassign contacts |
| `viewer` | No individual records: only their organisation, the staff list, tags and settings | Nothing (except their own profile) |

Until Session 3 adds `service_users`, **contacts stand in for service users** and `contacts.sales_id` is the "assigned worker". The policies follow two patterns that Session 3 reuses:

- **Assignable tables** (`contacts`, `deals`): `organisation_id` matches and either the caller sees everything or is a key worker and `sales_id` is theirs. The rule is written inline (each helper is evaluated once per query) and also exists as `private.can_access_assigned()` for functions.
- **Child tables** (`contact_notes`, `tasks`, `deal_notes`): visible when their parent is, via `exists (select 1 from parent ...)`, which runs under the parent's own policy. The assignment rule lives in one place.

Views (`contacts_summary`, `activity_log`, …) and `global_search` run as the caller, so they follow automatically. `merge_contacts` (SQL function and edge function) now refuses instead of half-merging when the caller can't delete the duplicate.

### Audit log

`audit_log` (`organisation_id`, `actor_user_id`, `action`, `table_name`, `record_id`, `before`, `after`, `created_at`) is written only by:

- the `audit_row_change` trigger on every tenant table (create, update and delete, with the row before and after), including changes made by the service role and by other triggers (cascades, the auth sync);
- `log_record_view(table_name, record_id)`, which the UI calls when a record page opens. It refuses records the caller can't see. Only `contacts` for now.

No app role can insert, update or delete rows; triggers also refuse updates, deletes and truncates from the service role and the table owner. Org admins and clinical leads read their organisation's log; key workers read the history of the contacts they can see; viewers read nothing.

Limits: view logging relies on the UI calling the function, so a direct API read isn't logged. Making reads go only through logging functions is a Session 3 design question for `service_users`.

### Attachments

The `attachments` bucket is private. Files live at `<organisation_id>/notes/<uuid>` (note attachments) or `<organisation_id>/shared/<uuid>` (company logos, avatars, organisation branding). Storage policies decide who may read each file, and the browser only gets signed URLs (1 hour) for those:

- `shared/`: every member of the organisation.
- `notes/`: org admins and clinical leads; otherwise only the uploader, or someone who can see a note the file is attached to (so key workers only get their own service users' files).
- Nobody but the service role deletes files.

When a note loses an attachment (edit or delete), the `cleanup_note_attachments` trigger queues the file in `storage_deletion_queue`, but only if it is in the note's own organisation folder and no other note still uses it. The `delete_note_attachments` function then deletes what is queued; it never takes paths from the request.

Files uploaded before Session 2 sit at the bucket root, outside every organisation folder, so only the service role can reach them now.

## 3c. Service users (Session 3)

All in `supabase/schemas/08_service_users.sql`, following the tenancy (section 3) and role (section 3b) patterns.

| Table | Notes |
|---|---|
| `service_users` | `display_name`, `reference_code` (`RE-12345`, unique per organisation), `release_date`, `risk_tier`, `assigned_worker_id` (a staff profile, `sales.id`), `consent_status`, `status`. Assignable like contacts: key workers see the people assigned to them. |
| `support_profiles` | One per service user, created with defaults by a trigger. Risk pathway, CBT module, check-in frequency and the three escalation thresholds (range-checked). `version` goes up on every change, and `updated_by` records who made it. |
| `escalations` | Trigger type, severity, `open` → `acknowledged` → `resolved`. A trigger stamps `acknowledged_at` and `resolved_at`; only leads delete. |
| `activity_events` | The live feed (`checkin`, `missed_checkin`, `cbt_deploy`, `logistics`, `escalation`, `override`, `profile_change`). App roles can add events but never change or remove them. |

- `programme_day` is derived (day 1 is the release date) in the `service_users_summary` view, with the count of unresolved escalations. A stored column can't depend on today's date.
- All four tables are audited, and `log_record_view` covers service users and their profiles.
- Phase 2 hooks: an open escalation is the signal that must stop AI replies, and `escalations.opened_at` and `acknowledged_at` are what an unacknowledged-escalation timer will read.
- Demo data comes from `scripts/seed-demo.mjs` (`make seed-demo`): two fictional organisations with an admin, a clinical lead, two key workers and a viewer each, 15 service users with configured profiles, a few open escalations and a week of activity.

## 3d. Screens (Session 4)

| Screen | Route | Who | Data |
|---|---|---|---|
| Live Control Tower | `/` | everyone | `control_tower_stats()` aggregates (KPIs, 7-day stability chart); the cohort and activity feed for staff only |
| Service user profile | `/service_users/:id/show` | admins, leads, the assigned key worker | profile configuration, status and assignment, escalations, activity, audit trail (`service_user_history()`) |
| Escalation queue | `/escalations` | admins, leads, key workers (their own) | `escalations`; acknowledge and resolve with notes |
| Team | `/sales` | org admins | staff and roles through the `users` edge function |

- **Status dots:** `service_user_stability()` gives critical (an unresolved high or critical escalation), watch (any other unresolved escalation, a missed check-in in the last 48 hours, or a high risk tier) or stable. The chart replays the same rule for each past day.
- **Viewers** get the KPIs and chart and nothing else. Small organisations may still be able to infer individuals from aggregates; consider a minimum cohort size before real data arrives.
- **The Atomic CRM frontend has been removed:** contacts, companies, deals, tasks, notes, tags, the CRM import, global search, `merge_contacts` and the MCP card. Its tables stay in the database until the next migration drops them (see `CLAUDE.md`).
- **Telemetry:** the app no longer pings the Atomic CRM authors' telemetry server.

## 4. Mapping the CRM onto the brief

| Atomic CRM | Re-entry | Plan |
|---|---|---|
| `sales` | Staff profile (key workers, leads, admins) | **Keep**, tenant-scoped (Session 1); role moves to `memberships` (Session 2) |
| `configuration` | Per-organisation settings and branding | **Keep**, one row per organisation (Session 1) |
| `contacts` | Service users | **Replaced** by the `service_users` table (Session 3). Contacts carry sales baggage (companies, newsletter, gravatar lookups, merge logic) that we don't want near health data; the table goes when the Session 4 screens replace its pages. |
| `contact_notes`, `tasks` | Case notes and actions | **Rebuild** against `service_users` in Session 3 if the screens need them; the Phase 1 screens don't require them. |
| `companies`, `deals`, `deal_notes`, `tags` | — | **Retire**: hide the screens in Session 4, drop the tables once nothing references them. |
| `activity_log` view | Activity feed | **Replace** with the `activity_events` table from the brief (Session 3). |
| Dashboard | Live Control Tower | **Replace** (Session 4). |
| Edge functions `users`, `update_password` | Staff management | **Keep**, tenant-scoped (Session 1). |
| Edge functions `mcp`, `merge_contacts` | — | **Disable** before any real deployment. `mcp` lets an AI client run SQL and must not ship to production. `merge_contacts` runs as the caller (RLS applies). |
| Edge function `delete_note_attachments` | Attachment cleanup | **Kept**, rewritten in Session 2 to drain a database queue (F9). |
| Edge function `postmark` | — | **Removed** in Session 2 (F10). |

## 5. Testing approach

- **Database tests** use pgTAP, run with `npx supabase test db` (or `make test-db`) against the local Supabase stack. They live in `supabase/tests/`. Each test impersonates real users by setting `role authenticated` and the JWT `sub` claim, which is exactly how requests arrive through the API.
- The tenancy suite (`supabase/tests/tenancy_isolation.test.sql`) creates two organisations with users and data, then proves, for every tenant table, that a user in one organisation can't select, insert, update or delete the other organisation's rows, and can't create cross-organisation links.
- The roles suite (`roles_permissions.test.sql`) signs in as each role and proves what it can see and change, including that key workers can't see or touch colleagues' records and viewers get no individual records.
- The audit suite (`audit_log.test.sql`) proves every insert, update and delete on every audited table writes a log row, views are logged, and nobody (app roles, service role, owner) can change or remove log rows.
- The Control Tower suite (`control_tower.test.sql`) covers the status dots, the aggregate stats (including that viewers get numbers but no rows) and the audit trail function.
- The data model suite (`service_users_model.test.sql`) covers the rules the database applies by itself: programme day, default profiles, versioning, escalation timestamps and value constraints.
- The storage suite (`storage_attachments.test.sql`) proves the bucket is private, who can read and upload what, and that the deletion queue only ever holds the note's own organisation's orphaned files.
- Frontend and edge-function unit tests stay on Vitest (`make test`).

## 6. Running it locally

```bash
make install
npx supabase start          # needs Docker
npx supabase test db        # database tests, including tenancy isolation
make test                   # frontend + edge function unit tests
```
