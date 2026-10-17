# Re-entry — Phase 1 Build Brief

> Put this file at `docs/PHASE1_BRIEF.md` in the repo. Every cloud session should read it (and `CLAUDE.md`) before doing anything.

## 1. What we're building

**Re-entry** is a support platform for people leaving prison, focused on the high-risk first 72 hours and first 90 days after release. It has two halves:

1. **The service-user side:** a WhatsApp conversation that checks in proactively, helps with logistics (appointments, addresses, transport), runs short CBT-style exercises, and hands off to a human the moment risk is detected.
2. **The Control Tower:** a web dashboard for key workers (probation, clinical, housing) to configure each person's support profile, see the whole caseload at a glance, and respond to escalations.

This repo starts from **Atomic CRM** (MIT licence, React + shadcn/ui + Supabase/PostgreSQL). Atomic CRM becomes the **Control Tower**. The WhatsApp engine is Phase 2.

## 2. Phase 1 goal

Turn Atomic CRM into a **secure, multi-tenant Control Tower foundation** that runs on synthetic demo data and is ready for the WhatsApp engine to plug into.

No real personal data goes into this system in Phase 1. Ever.

## 3. Non-negotiables

- **Tenant isolation:** each customer organisation (for example a probation region or a charity) must never see another's data. Enforce it in the database with Postgres row-level security, not just in the UI.
- **Least privilege:** a key worker sees only the service users assigned to them.
- **Audit everything:** every create, update, delete and view of a service-user record is logged in an append-only table.
- **Synthetic data only:** seed data uses invented names and details.
- **No secrets in git:** use environment variables and `.env.example`.
- **UK data residency:** assume Supabase is hosted in a UK or EU region. Don't add third-party services that send data outside the UK or EU without flagging it.
- **Licence:** keep Atomic CRM's MIT `LICENSE` file and copyright notice.

## 4. Data model (starting point; propose changes if the code suggests better)

| Table | Purpose | Key fields |
|---|---|---|
| `organisations` | The tenant | id, name, created_at |
| `memberships` | User ↔ organisation ↔ role | user_id, organisation_id, role (`org_admin`, `clinical_lead`, `key_worker`, `viewer`) |
| `service_users` | People being supported | organisation_id, display_name, reference_code (e.g. RE-88492), release_date, programme_day (derived), risk_tier (`low`/`moderate`/`moderate_high`/`high`), assigned_worker_id, consent_status, status |
| `support_profiles` | Per-person configuration (the "Clinical Profile Configuration" screen) | service_user_id, primary_risk_pathway (`substance_use`, `housing_instability`, `financial_stress`, `interpersonal_conflict`), active_cbt_module (`distress_tolerance`, `cognitive_reframing`, `emotional_regulation`, `urge_surfing`, `radical_acceptance`), checkin_frequency, sentiment_dip_days, missed_checkins_threshold, keyword_sensitivity (1–10), version |
| `escalations` | Risk events needing a human | organisation_id, service_user_id, trigger_type, severity, status (`open`/`acknowledged`/`resolved`), assigned_to, opened_at, acknowledged_at, resolved_at, notes |
| `activity_events` | Feed of automated and human actions (the "Live Action Logs") | organisation_id, service_user_id, type (`checkin`, `cbt_deploy`, `logistics`, `escalation`, `override`, …), summary, created_at |
| `audit_log` | Append-only compliance log | organisation_id, actor_user_id, action (`create`/`update`/`delete`/`view`), table_name, record_id, before (jsonb), after (jsonb), created_at |

Every tenant-owned table carries `organisation_id`. Remove or hide Atomic CRM features that don't fit (deals and sales pipeline, for example) rather than leaving them half-working.

## 5. Permissions

| Role | Can see | Can change |
|---|---|---|
| `org_admin` | Everything in their organisation | Members, roles, organisation settings, any profile |
| `clinical_lead` | All service users in their organisation | Profiles, escalations, assignments |
| `key_worker` | Only service users assigned to them | Those users' profiles and escalations |
| `viewer` | Anonymised aggregate dashboard only | Nothing |

Enforce these with RLS policies plus helper SQL functions (for example `current_user_role(org_id)`). The UI should hide what a role can't do, but the database is the real guard.

## 6. Audit log rules

- Write entries from **database triggers**, so nothing can bypass them from the app.
- Grant no `UPDATE` or `DELETE` on `audit_log` to any app role.
- Log record views of `service_users` and `support_profiles` through an RPC or edge function the UI calls when opening a record.
- Add an Audit Trail panel to the profile screen showing that record's history. This matches the "Configuration Audit Trail" in the pitch mockups.

## 7. Screens for Phase 1

1. **Live Control Tower:** cohort list with status dots (stable, watch, critical); KPI cards (active clients, check-in adherence, open escalations); a 7-day stability chart; the activity feed. This is the landing page.
2. **Service user profile and configuration:** the Clinical Profile Configuration form (risk pathway, CBT module, key worker, check-in frequency, escalation thresholds), plus the Audit Trail panel.
3. **Escalation queue:** open escalations, with acknowledge and resolve actions and notes.
4. **Organisation admin:** invite members and set roles.

Use the pitch mockups (dark Control Tower styling) as the visual direction where practical, but working permissions and auditing come before polish.

## 8. Seed data

A script that creates **two** organisations (to prove isolation), each with an admin, a clinical lead, two key workers and about 15 synthetic service users with profiles, a few open escalations and a week of activity events. Use clearly fictional names.

## 9. Tests (required, not optional)

Automated tests that prove:

- A user in org A **cannot** read or write any row belonging to org B, on every tenant table.
- A key worker **cannot** see a service user not assigned to them.
- A `viewer` cannot read individual service-user records.
- Every insert, update and delete on audited tables produces an `audit_log` row.
- `audit_log` rows cannot be updated or deleted by app roles.

## 10. Working rules for Claude

- **Session 1 starts with exploration, not edits:** read the codebase, then write `docs/ARCHITECTURE.md` explaining how Atomic CRM is structured and your plan for mapping it to this brief. Commit that before changing code.
- Work on a feature branch per task, with small commits and a pull request at the end of each session.
- Write database changes as Supabase migrations, never as manual edits.
- Update `CLAUDE.md` with anything a future session needs to know.
- If something in this brief conflicts with how the code works, stop and explain the trade-off in the PR description rather than guessing.

## 11. Suggested session order

| Session | Scope | Done when |
|---|---|---|
| 1 | Explore, write ARCHITECTURE.md, organisations, memberships, tenancy RLS, isolation tests | Cross-tenant tests pass |
| 2 | Roles and permissions, audit log triggers, audit tests | All permission and audit tests pass |
| 3 | Data model for service users, profiles, escalations, activity events, plus seed script | Demo data loads into two orgs |
| 4 | Control Tower, profile, escalation and admin screens | All four screens work for each role |

## 12. Out of scope for Phase 1 (Phase 2 preview)

Phase 2 adds the WhatsApp engine: WhatsApp Business Cloud API webhook → Supabase edge function → **deterministic risk screen first** (keyword and threshold rules, no AI) → escalation or AI-assisted reply. Requirements to design for now:

- Any risk trigger must open an `escalation` and stop AI replies for that conversation until a human closes it.
- If no human acknowledges an escalation within a set time, or it's out of hours, the user must automatically get crisis contacts (999, Samaritans 116 123, NHS 111 option 2) instead of silence.
- Service users must give clear, recorded consent explaining **who sees what**, especially whether disclosures reach their probation officer.
- Message content is the most sensitive data in the system: encrypt at rest, minimise retention, and audit every read.
