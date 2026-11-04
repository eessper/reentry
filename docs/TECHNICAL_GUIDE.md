# Re-entry: technical guide

How the system is built, how to deploy it, and how the WhatsApp channel and AI connect to it. For what the screens do, read `docs/USER_GUIDE.md`. For the security model in depth, read `docs/ARCHITECTURE.md`.

> **Status.** Sections 1–5 describe what exists and how to deploy it today (Phase 1). Sections 6–8 are the **design for Phase 2**: the WhatsApp engine and the AI step are not built yet. Code in those sections is a reference sketch to build from, not code in the repo.

---

## 1. The system at a glance

```
                    ┌────────────────────────────── Supabase project (UK: eu-west-2) ───────────────────────────────┐
 Staff browser      │                                                                                                │
 (Control Tower) ──►│  Auth (sign-in, invites)     PostgREST API (tables/views/RPC)     Storage (logos, avatars)    │
 static React app   │        │                            │  row-level security on every table                      │
                    │        ▼                            ▼                                                         │
                    │   ┌──────────────────────── Postgres ─────────────────────────┐                               │
                    │   │ organisations, memberships, sales (staff), configuration  │                               │
                    │   │ service_users, support_profiles, escalations,             │                               │
                    │   │ activity_events, case_notes, case_actions                 │                               │
                    │   │ audit_log (append-only, written by triggers)              │                               │
                    │   └───────────────────────────────────────────────────────────┘                               │
                    │        ▲                                                                                       │
                    │  Edge functions (Deno, service role): users, update_password                                   │
                    │  Phase 2: whatsapp_webhook, send_checkins, escalation_watchdog                                 │
                    └────────────────────────────────────────────────────────────────────────────────────────────────┘
                              ▲                                   │
              Phase 2         │ webhooks (signed)                 │ AI-assisted replies (after the risk screen)
                    WhatsApp Business Cloud API (Meta)      Claude via Amazon Bedrock or Google Vertex AI (EU/UK region)
```

| Part | Technology | Where the code is |
|---|---|---|
| Control Tower (web app) | React 19, Vite, TypeScript, shadcn/ui, ra-core | `src/` |
| Database, API, auth, files | Supabase: Postgres 15, PostgREST, GoTrue, Storage | `supabase/schemas/` (source of truth), `supabase/migrations/` |
| Server-side logic | Supabase Edge Functions (Deno) | `supabase/functions/` |
| Tests | pgTAP (database), Vitest (app and functions), Playwright (end-to-end) | `supabase/tests/`, `src/**/*.test.ts(x)`, `e2e/` |
| CI | GitHub Actions | `.github/workflows/` |

**Key design rules** (see `CLAUDE.md` for the full list):
- **Tenancy and permissions live in the database.** Every tenant table has `organisation_id` and row-level security (RLS), and roles come from `memberships.role`. The web app only hides buttons; the database is the real guard.
- **Edge functions bypass RLS.** They run with the service role, so each one must check the caller's organisation itself.
- **Everything is audited.** Triggers write `audit_log` on every create, update and delete, and record views are logged through `log_record_view()`. Nobody can change or delete audit rows.
- **No data leaves the UK/EU without a decision.** The brief requires this. Every external service below has a residency note.

---

## 2. Environments

| Environment | What it is | Data |
|---|---|---|
| **Local** | `make start`: Supabase in Docker plus the Vite dev server | Synthetic (`make seed-demo`) |
| **Hosted demo** | The app built in demo mode (`vite.demo.config.ts`), no backend: data lives in the browser | Synthetic, regenerated on load |
| **Staging** | A hosted Supabase project plus the hosted web app | Synthetic only |
| **Production** | A separate hosted Supabase project plus the web app | Real data, **only after the Phase 2 data protection sign-off** |

Use **separate Supabase projects** for staging and production. Never point staging at production data.

### Environment variables

`.env.example` lists every variable. None of them are secret apart from those marked **secret**. Secrets never go in git; set them in the host's secret store.

| Variable | Used by | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Web app (build time) | `https://<project-ref>.supabase.co` |
| `VITE_SB_PUBLISHABLE_KEY` | Web app (build time) | The project's **publishable** key. It is public by design; RLS protects the data. |
| `VITE_IS_DEMO` | Web app (build time) | `false` for real deployments. `true` builds the in-browser demo. |
| `VITE_ATTACHMENTS_BUCKET` | Web app | `attachments` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (**secret**) | Admin scripts and edge functions | Edge functions get these automatically on the hosted platform. Never put the service role key in the web app. |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID` (**secret**) | CI deploy job | Personal or CI access token from the Supabase dashboard |
| Phase 2: `WHATSAPP_*`, `AWS_*` / `GOOGLE_*` (**secret**) | Edge functions | See sections 6–7 |

---

## 3. Running it locally

Needs Node 24 (see `.nvmrc`) and Docker.

```bash
make install                                  # npm install + local Supabase images
make start                                    # Supabase in Docker + app on http://localhost:5173
npx supabase db reset --local && make seed-demo   # two fictional organisations, password demo-password
```

| Command | What it runs |
|---|---|
| `make test-db` | pgTAP: tenancy, roles, audit, storage, data model, Control Tower (230 tests) |
| `make test` | Vitest: app and edge-function unit tests |
| `make typecheck`, `make lint` | TypeScript, ESLint and Prettier |
| `make test-e2e` | Playwright end-to-end tests against a separate, freshly reset Supabase instance |
| `make start-demo` | The app with in-browser demo data, no Supabase |

**Changing the database:**
1. Edit the declarative schema in `supabase/schemas/`.
2. Write a migration in `supabase/migrations/`.
3. Check that the two match with `npx supabase db diff --local --use-pg-schema`. That command always reports a spurious `DROP EXTENSION "pgjwt"` and some grant noise; nothing else should appear.
4. Add pgTAP tests for any new table or rule.

`CLAUDE.md` has the details.

---

## 4. Deploying

### 4.1 One-off: create the Supabase project

1. **Create the project** in the Supabase dashboard. Pick the specific region **London (eu-west-2)**. The general "Europe" option may place it elsewhere.
   - `make supabase-remote-init` can create the project for you, but make sure you pick London when it asks.
2. **Choose the right plan.** Use a paid plan for production, so you get daily backups. Consider point-in-time recovery for production.
3. **Link the repo and deploy the schema and functions:**
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push              # applies every migration in supabase/migrations/
   npx supabase functions deploy     # users, update_password
   ```
4. **Configure Auth** (dashboard → Authentication):
   - **Sign-ups:** turn off "Allow new users to sign up". Staff are only invited by an org admin through the `users` function, which uses the admin API and is unaffected. The database also rejects any account without an organisation (`on_auth_user_created`); this setting is the first layer.
   - **Site URL:** your app's URL, for example `https://controltower.example.org`.
   - **Redirect URLs:** add `https://controltower.example.org/auth-callback.html`.
   - **SMTP:** configure an email provider that sends from the UK/EU (invites and password resets). The built-in sender is rate-limited and for testing only.
   - **OAuth server:** keep it **off**. Nothing uses it any more, and leaving it on lets third-party apps register.
   - **Recommended:** require MFA for org admins and clinical leads, and set a minimum password length of at least 12.
5. **Check Storage.** The `attachments` bucket must be **private**. The migrations set this; confirm it in the dashboard.
6. **Create the first organisation and its admin.** Run this from a trusted machine, never from CI:
   ```bash
   SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret> \
     node scripts/create-organisation.mjs --name "Northbridge Probation Region" --email admin@example.org
   ```
   The admin then signs in and invites everyone else from the **Team** page.
7. **Never run `make seed-demo` against production.** The script refuses non-local URLs unless given `--allow-remote`; only use that on staging.

### 4.2 The web app

The app is static files (`npm run build` → `dist/`). It talks directly to Supabase from the browser, so the host only serves files and never sees personal data. Even so, choose a UK/EU host or CDN and keep analytics off. Telemetry is already disabled (`<CRM disableTelemetry />`).

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co \
VITE_SB_PUBLISHABLE_KEY=<publishable key> \
VITE_IS_DEMO=false \
npm run build          # outputs dist/
```

Any static host works. Configure it as follows:
- serve `index.html` for unknown paths
- serve over HTTPS
- send the security headers in `.claude/rules/web-security.md`: HSTS, `X-Frame-Options: DENY`, `nosniff`, a Content-Security-Policy whose `connect-src` allows your Supabase URL, and `Referrer-Policy`.

### 4.3 CI/CD (`.github/workflows/`)

| Workflow | When | What |
|---|---|---|
| `check.yml` | Pull requests and pushes to `main` | The Playwright e2e suite (with its own Supabase) on every PR; typecheck, lint, unit tests and build are **skipped on draft PRs** and run once a PR is marked ready for review |
| `deploy.yml` | Push to `main` | Inherited from Atomic CRM: deploys the docs site, the demo and, if the Supabase secrets are set, `supabase db push` + `functions deploy` + the app to GitHub Pages |

**Before relying on `deploy.yml` for staging or production, change three things:**
1. **Remove the `deploy-doc` job.** It publishes Atomic CRM's documentation site, which isn't ours.
2. **Pick a UK/EU host for the app**, or accept GitHub Pages. GitHub Pages is US-hosted, but it only serves the static app, never data.
3. **Gate production behind a GitHub Environment with required reviewers**, so migrations only reach production after a person approves.

The repository secrets the deploy job needs are `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `SUPABASE_URL` and `SB_PUBLISHABLE_KEY`.

### 4.4 The hosted demo

`NODE_ENV=CI npx vite build --config vite.demo.config.ts --outDir <dir>` produces a self-contained build. It uses hash routing and relative paths, has no backend, and works on any static host. This is what the shared demo link runs.

### 4.5 Release checklist

- [ ] `check.yml` is green on the commit, including e2e.
- [ ] New migrations have been read by a second person: they are permanent in production.
- [ ] `npx supabase db push --dry-run` against the target shows only the expected migrations.
- [ ] Back up before a risky migration: the dashboard backup, or `npx supabase db dump`.
- [ ] Deploy the database, then the functions, then the app, in that order. Older app code keeps working with additive schema changes.
- [ ] Smoke test on the target: sign in as an admin, open a profile and check the audit trail shows "Record opened".

### 4.6 Operations

- **Backups.** Supabase takes daily backups on paid plans. Test a restore into staging at least once before go-live.
- **Logs.** The Supabase dashboard has API, Postgres, Auth and Edge Function logs. **Never log message content or personal data** from edge functions; log ids and rule names instead.
- **Audit log.** It is append-only and grows forever. Agree a retention period with the data protection officer before production. Archiving would need a deliberate migration, because the triggers block deletes.
- **Access to the dashboard.** The dashboard bypasses RLS, so limit who can use it, require MFA, and review the member list quarterly.
- **Rotating secrets.** Rotate the service role key, WhatsApp tokens and cloud credentials by updating `npx supabase secrets set ...` and redeploying functions. Rotating the publishable key needs a new web app build.

---

## 5. Security checklist for go-live

- [ ] RLS: `make test-db` passes against a copy of the production schema.
- [ ] Sign-ups off, OAuth server off, MFA required for admins and leads.
- [ ] Storage bucket private. No public URLs are stored anywhere.
- [ ] Service role key exists only in edge function secrets and on trusted admin machines.
- [ ] Every third-party processor (email, WhatsApp, AI, hosting) is listed with its region in the data protection impact assessment (DPIA).
- [ ] Penetration test on staging.
- [ ] Incident runbook: who to call, how to disable the WhatsApp number, how to revoke a user.

---

## 6. Connecting WhatsApp (Phase 2 design)

### 6.1 What you need

1. **Accounts and number:**
   - a **Meta Business** account (verified)
   - a **WhatsApp Business Account** (WABA)
   - a dedicated phone number for the service
   - a **Meta app** with the WhatsApp product enabled
2. **A permanent access token** from a Meta system user with access to the WABA. It goes in `WHATSAPP_ACCESS_TOKEN` (**secret**).
3. **App credentials:**
   - the app's **App Secret**, used to check webhook signatures: `WHATSAPP_APP_SECRET` (**secret**)
   - the **phone number ID**: `WHATSAPP_PHONE_NUMBER_ID`
4. A **verify token** you make up (a long random string), used once when registering the webhook: `WHATSAPP_VERIFY_TOKEN` (**secret**).
5. **Message templates**, approved by Meta, for the check-ins Re-entry starts itself (see 6.4).

Set them as function secrets:

```bash
npx supabase secrets set WHATSAPP_ACCESS_TOKEN=... WHATSAPP_APP_SECRET=... \
  WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_VERIFY_TOKEN=...
```

### 6.2 Data residency

WhatsApp is run by Meta. By default the Cloud API stores message data in the US.
- **Local storage.** Meta's Cloud API "local storage" option keeps stored message content in a chosen region; providers list the EU (Germany), the UK and Switzerland. It is set per phone number when the number is registered.
- **Processing.** Message content may still be *processed* in Meta data centres outside that region.
- **Changing it later.** Providers report that the setting can't easily be changed afterwards: the number has to be deregistered and registered again.

**Enable UK local storage when registering the production number, and record Meta as a processor in the DPIA.** This must be signed off before real people are onboarded. Confirm the current options against Meta's own documentation when setting up.

### 6.3 Receiving messages: the `whatsapp_webhook` edge function

Meta calls one URL: `https://<project-ref>.supabase.co/functions/v1/whatsapp_webhook`.
- **Set `verify_jwt = false`** for this function in `config.toml`. Meta doesn't send a Supabase token; the request signature is checked instead.
- **GET request (registration):** when you save the webhook in Meta's dashboard, Meta sends `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge`. If the token matches `WHATSAPP_VERIFY_TOKEN`, return `hub.challenge` as plain text; otherwise return 403.
- **POST request (events):** Meta signs the **raw body** with HMAC-SHA256 using the App Secret, in the header `X-Hub-Signature-256: sha256=<hex>`.
  - Check it before parsing the body, compare in constant time, and reject with 401 if it doesn't match.
  - Return `200` quickly. Meta retries deliveries, so make processing **idempotent** on the WhatsApp message id.

What happens to each incoming message:

```
1. Verify signature  ─ fail → 401, log nothing else
2. De-duplicate on the WhatsApp message id (unique key in the database)
3. Find the service user by their WhatsApp number (stored as a keyed hash; see 6.5)
       unknown number → polite "this number isn't registered" reply, nothing stored
4. Consent check: consent_status must be 'given', otherwise send the consent message only
5. DETERMINISTIC RISK SCREEN (src/components/atomic-crm/conversation/riskScreen.ts, shared code):
       match → open escalation (trigger 'keyword', severity from the rule, note names the rule)
             → record an activity event
             → mark the conversation PAUSED
             → send the handover message (+ UK crisis contacts if critical)
             → STOP. No AI call.
6. Conversation paused (any unresolved escalation)? → send the fixed holding reply → STOP
7. Check-in score?  → record the check-in, reply from the script (no AI needed)
8. Otherwise → AI-assisted reply (section 7), then
       run the risk screen again on the AI's draft reply as a safety net
       → send the reply → record an activity event (type, not content)
```

The UI preview already implements steps 5–7, and its tests cover them (`conversation/*.test.ts`). Move `riskScreen.ts` and `replies.ts` into `supabase/functions/_shared/` so the browser and the engine run **the same rules**. They have no browser-only dependencies.

Reference sketch of the entry point (Deno):

```ts
// supabase/functions/whatsapp_webhook/index.ts (Phase 2 sketch)
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

const isSignedByMeta = async (rawBody: string, header: string | null) => {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const given = header.slice("sha256=".length);
  // constant-time comparison
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response(null, { status: 403 });
  }
  const rawBody = await req.text();
  if (!(await isSignedByMeta(rawBody, req.headers.get("X-Hub-Signature-256")))) {
    return new Response(null, { status: 401 });
  }
  const payload = JSON.parse(rawBody);
  // For each entry[].changes[].value.messages[]: steps 2-8 above, using the
  // service-role client and checking the organisation explicitly (RLS is bypassed).
  EdgeRuntime.waitUntil(handleMessages(payload));
  return new Response("ok");
});
```

### 6.4 Sending messages

- **Endpoint:** replies go to Meta's Graph API `POST /<WHATSAPP_PHONE_NUMBER_ID>/messages`, with the access token as a Bearer token.
- **24-hour customer service window:**
  - Within 24 hours of the person's last message, any text reply is allowed.
  - Outside it, for example a morning check-in, only an **approved template** can be sent.
  - Plan templates for: the daily check-in, appointment reminders and the consent request.
  - Keep crisis contacts in a template too, so they can always be sent.
- **Scheduled check-ins** (`send_checkins` function): run it from `pg_cron`, for example every 15 minutes. It reads each active service user's `checkin_frequency`, sends due templates and records `checkin` / `missed_checkin` activity events.
- **Escalation watchdog** (`escalation_watchdog`): run it from `pg_cron` every minute. Any escalation still `open` past its acknowledge deadline, or outside agreed hours, sends the crisis-contacts template and records an activity event. This is the automatic version of the "nobody acknowledges within 15 minutes" button in the preview.

### 6.5 Data model additions (Phase 2)

Each of these follows the tenant-table pattern in `CLAUDE.md`: `organisation_id`, RLS, an audit trigger and tests.

| Table | Purpose | Notes |
|---|---|---|
| `whatsapp_contacts` | Links a WhatsApp number to a service user | Store an HMAC of the number (keyed with a secret) for lookups, plus the number itself encrypted. Keep the number off `service_users`, so the people list never exposes it. |
| `conversations` | One per service user | `paused` is derived from unresolved escalations; the last message time drives the 24-hour window |
| `messages` | Message content | **The most sensitive data in the system.** Encrypt the text at rest with an application key (Supabase Vault or a cloud KMS), keep a minimal retention period with a scheduled purge, never copy it into `audit_log`, and log every read with `log_record_view('messages', id)`. Staff see message text only on the person's profile and only within their role. |
| `consents` | Recorded consent | What was shown, when, the answer, and who sees what (especially whether disclosures reach probation) |

---

## 7. Connecting the AI (Phase 2 design)

### 7.1 Where AI is and isn't used

| Step | AI? |
|---|---|
| Risk screen on incoming messages | **Never.** Deterministic keyword and threshold rules only (brief requirement). |
| Escalation decisions, pausing, crisis contacts | **Never.** Rules and humans only. |
| Check-in scores, logistics lookups, CBT exercise selection | Not needed: scripted, as in the preview |
| Conversational replies when nothing above applies | **Yes**, an AI-assisted draft, screened again before sending |
| Staff summaries (for example "summarise this week for the key worker") | Optional later; staff-only, never sent to the service user |

### 7.2 Choosing the provider: UK/EU data residency

Claude can be reached three ways. Only some keep processing in Europe:

| Route | Residency | Fit |
|---|---|---|
| **Amazon Bedrock**, in an EU or UK AWS region | Requests are processed in the AWS region you call | **Recommended**: data stays in your AWS region, using your own AWS account and IAM |
| **Google Vertex AI**, `eu` multi-region or a European region | Requests are processed in the chosen region | Good alternative, if you're on Google Cloud |
| Anthropic API (first-party) | Geography can be pinned to `us` or left `global`; there is no EU-only option | Doesn't meet the residency rule for message content |

Check the provider's model-availability page for the region you choose, because not every model is offered in every region.

**Data protection notes:**
- Sign the provider's data processing agreement (DPA).
- Confirm that they don't train on your inputs. That is the default on Bedrock and Vertex; confirm it contractually.
- Confirm how long they retain prompts.
- Send the **minimum**: the person's first name only, their programme day and the recent turns. Never send reference codes, addresses, other people's details or case notes.

### 7.3 Model

Use **Claude Opus 5.5** (model ID `claude-opus-5-5`; on Bedrock `anthropic.claude-opus-5-5`; on Vertex `claude-opus-5-5`).
- **Cheaper, faster options:** Claude Sonnet 5.5 (`claude-sonnet-5-5`) and Claude Haiku 5.5 (`claude-haiku-5-5`) cost less and answer faster.
- **Choosing:** decide only after measuring reply quality on a set of synthetic conversations (7.5).
- **Effort:** keep `output_config.effort` at `low` or `medium`, because replies are short.

### 7.4 Calling it

TypeScript, using Anthropic's Bedrock client inside a Supabase edge function. The AWS credentials come from function secrets: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for an IAM user limited to `bedrock:InvokeModel*` on this model, and `AWS_REGION`.

```ts
// supabase/functions/_shared/aiReply.ts (Phase 2 sketch)
import { AnthropicBedrockMantle } from "npm:@anthropic-ai/bedrock-sdk";

const client = new AnthropicBedrockMantle({ awsRegion: Deno.env.get("AWS_REGION")! }); // a UK/EU region

// Stable instructions first, so they can be cached; nothing personal in here.
const SYSTEM = `You are the Re-entry support assistant on WhatsApp, helping someone in their first
90 days after release from prison. Be warm, brief (2-3 short sentences), practical and non-judgemental.
Never give legal, medical or financial advice beyond signposting. Never promise anything on behalf of
staff. If the person seems at risk, say their support team will contact them and give 999 and
Samaritans 116 123. Reply in plain UK English.`;

export const draftReply = async (
  firstName: string,
  programmeDay: number,
  recentTurns: { role: "user" | "assistant"; content: string }[],
) => {
  const response = await client.messages.create({
    model: "anthropic.claude-opus-5-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      // Per-person context goes after the cached block, so the cache still applies
      { type: "text", text: `The person's first name is ${firstName}; today is day ${programmeDay} of their programme.` },
    ],
    messages: recentTurns, // must start with a user turn
  });
  if (response.stop_reason === "refusal") return null; // fall back to the scripted reply
  const text = response.content.find((block) => block.type === "text");
  return text?.type === "text" ? text.text : null;
};
```

Rules around the call:
- **Timeout and fallback.** If the AI fails, times out or refuses, send the scripted fallback reply ("Thanks for your message, your key worker can see how you're getting on"). The person always gets an answer.
- **Screen the draft.** Run the risk screen over the AI's draft as well as the incoming message. Never send a draft that names medication doses, legal outcomes or third parties.
- **Log metadata only.** Record that an AI reply was sent (activity event `logistics` or a new `ai_reply` type), the model and the token counts, never the text, outside the encrypted `messages` table.
- **Don't let the AI act.** It doesn't get tools in Phase 2. Anything that changes a record (appointments, escalations) stays deterministic or with staff.

On Google Vertex AI instead:

```ts
import { AnthropicVertex } from "npm:@anthropic-ai/vertex-sdk";
const client = new AnthropicVertex({ projectId: "<gcp-project>", region: "europe-west2" }); // or "eu"
// same messages.create call, with model: "claude-opus-5-5"
```

### 7.5 Testing the AI safely

- **Synthetic conversations only.** Build an evaluation set of 50–100 synthetic conversations: ordinary chat, practical questions, borderline distress and clear risk. The clear-risk cases must never reach the AI, because the screen stops them.
- **Score each reply** for tone, length, accuracy, and whether it stays within scope (no advice it shouldn't give). Re-run the set whenever the prompt or model changes.
- **Get clinical sign-off.** A clinical lead reviews the system prompt and a sample of outputs before go-live.

---

## 8. Phase 2 build order

Each step is its own PR, following the same rules as Phase 1: schema first, then the migration, RLS, audit and tests.

1. **Shared rules.** Move `riskScreen.ts` and `replies.ts` into `supabase/functions/_shared/` and import them in both places. Add Deno tests.
2. **Data model.** Add `whatsapp_contacts`, `conversations`, `messages` (encrypted) and `consents`, with pgTAP tests for tenancy, roles, audit and read-logging.
3. **`whatsapp_webhook`.** Signature check, de-duplication, consent, risk screen, escalation and pause, scripted replies. Test it with Meta's test number on staging.
4. **Sending and templates.** Add `send_checkins` and `escalation_watchdog` with `pg_cron`, and get Meta to approve the templates.
5. **AI step.** Bedrock or Vertex in a UK/EU region, the system prompt, fallbacks and the evaluation set (section 7).
6. **Control Tower.** Show the real conversation on the profile in place of the simulated preview, logging every read, with a "take over / resume AI" control for staff.
7. **Go-live gate.** DPIA signed, penetration test, clinical sign-off on prompts and templates, and the response-time and out-of-hours rota agreed (`USER_GUIDE.md` section 2).
