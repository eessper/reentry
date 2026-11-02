# Re-entry Control Tower: user guide

This guide is for the people who use the Control Tower every day (key workers, clinical leads, organisation admins and viewers) and for anyone running a demo of it. It also sets out how we expect the service to run day to day.

> **Phase 1 uses synthetic data only.** Every name, reference and message in the system and in this guide is invented. Do not enter real personal data until the Phase 2 data protection work is signed off.

---

## 1. What Re-entry is

Re-entry supports people in the first 72 hours and first 90 days after release from prison. It has two halves:

1. **The conversation (Phase 2).** A WhatsApp conversation that checks in with each person, helps with logistics (appointments, addresses, travel, money) and runs short CBT-style exercises. Every incoming message goes through a **deterministic risk screen first**. If it finds risk, it hands the conversation to a person straight away.
2. **The Control Tower (this app).** The web dashboard for the staff around each person: probation, clinical and housing key workers. They configure each person's support, see the whole caseload at a glance, and respond to escalations.

Phase 1 builds the Control Tower on synthetic data. The profile page includes a **WhatsApp preview**: a simulation of the Phase 2 conversation, so staff and clients can see how the two halves fit together.

---

## 2. How we expect it to work

### The people involved

| Who | What they do in Re-entry |
|---|---|
| **Service user** | Gets check-ins and support on WhatsApp (Phase 2). Gives recorded consent first, including who sees what. |
| **Key worker** | Owns a caseload. Configures each person's support profile, keeps case notes and actions, and answers escalations for their people. |
| **Clinical lead** | Oversees every service user in the organisation. Assigns people to key workers, tunes profiles and picks up escalations nobody has acknowledged. |
| **Organisation admin** | Everything a clinical lead can do, plus inviting staff, setting roles and organisation settings. |
| **Viewer** | Commissioners, managers or auditors who need the numbers but not the people. They see aggregate figures only. |

### A typical day

1. **Morning check-ins go out** (Phase 2), at the frequency set on each profile: twice daily, daily, every other day or weekly. Replies land in the activity feed: "Check-in completed, mood 6/10", or "Missed check-in".
2. **Key workers open the Live Control Tower.** The cohort list is sorted worst first. Red dots (**critical**) and amber dots (**watch**) are the people to look at today.
3. **Escalations get handled** from the escalation queue or the person's profile: **acknowledge** to show someone has it, then **resolve** with a note saying what was done.
4. **Work is written down** on the profile: a **case note** for what happened, and an **action** for anything agreed ("Book GP registration", due Thursday).
5. **Profiles get tuned** as people settle or struggle: the CBT module, the check-in frequency, and how sensitive the risk screen should be.

### When risk is detected

Messages go through these steps:

```
Message arrives
   │
   ▼
Deterministic risk screen (keyword rules, no AI)
   │
   ├── no match ──► scripted / AI-assisted reply (check-in, logistics, CBT exercise)
   │
   └── match ─────► 1. Escalation opened (trigger: keyword, severity from the rule)
                    2. AI replies PAUSED for this person
                    3. Person told a human will contact them
                       (critical matches: UK crisis contacts sent straight away)
                    4. Staff acknowledge, then resolve with a note
                    5. Replies resume only when no escalation is left open
```

- **Pausing is automatic and conservative.** While any escalation for the person is unresolved, the assistant sends no AI replies. It sends only a fixed holding message with crisis numbers.
- **Nobody acknowledges in time, or it's out of hours?** The person automatically gets UK crisis contacts instead of silence: **999** for immediate danger, **Samaritans 116 123** (free, 24/7) and **NHS 111, option 2** for urgent mental health help.
- **Escalation notes never quote the message.** Staff see which rule matched ("self harm", "relapse"), not the person's words. In Phase 2, message content will be stored encrypted, kept only as long as needed, and every read will be audited.

### Response expectations (to agree with each customer)

These are suggested defaults to confirm with each organisation before go-live. The software does not enforce them yet.

| Severity | Examples (rule) | Acknowledge within | Who |
|---|---|---|---|
| Critical | Self-harm, harm to others | 15 minutes | Assigned key worker, then clinical lead |
| High | Relapse | 1 hour | Assigned key worker |
| Medium | Distress, housing loss, missed check-ins | Same working day | Assigned key worker |
| Low | Manual flags | Next working day | Assigned key worker |

### Consent

Each service user's consent status is shown on their profile: **pending**, **given** or **withdrawn**. In Phase 2, nobody is contacted until consent is **given**. The consent explanation must say clearly **who sees what**, especially whether disclosures reach their probation officer.

---

## 3. Roles: who can see and do what

The database enforces these rules, not just the screens, so a role cannot get round them by editing a URL or calling the API directly.

| | Org admin | Clinical lead | Key worker | Viewer |
|---|---|---|---|---|
| Live Control Tower figures | Whole organisation | Whole organisation | Their caseload | Whole organisation (aggregates only) |
| Cohort list and activity feed | Everyone | Everyone | Their people | Hidden |
| Open a service user's profile | Anyone | Anyone | Their people | No |
| Add a service user / change key worker | Yes | Yes | No | No |
| Configure a support profile | Yes | Yes | Their people | No |
| Acknowledge / resolve escalations | Yes | Yes | Their people | No |
| Write case notes | Yes | Yes | Their people | No |
| Edit a case note | Their own | Their own | Their own | No |
| Delete a case note | Yes | Yes | No | No |
| Add / tick off actions | Yes | Yes | Their people | No |
| Read the audit trail | Everything | Everything | Their people | No |
| Team: invite staff, set roles | Yes | No | No | No |
| Organisation settings (name, logo) | Yes | No | No | No |

Each organisation's data is completely separate. Nobody, whatever their role, can see or change another organisation's records.

---

## 4. Signing in and accounts

- **There is no public sign-up.** An organisation admin invites each member of staff from the **Team** page. The invitee gets an email to set their password.
- Each person belongs to **one organisation** with **one role**.
- **Forgot your password?** Use "Forgot password" on the sign-in page.
- **Leaving staff:** an admin disables the account on the Team page. Accounts are never deleted, so the audit trail keeps their name.
- **Your profile** (top-right menu → Profile): change your name and avatar, or send yourself a password reset email.

Setting up a new organisation and its first admin is a one-off technical step (see `CLAUDE.md`, "Tenancy").

---

## 5. The screens

### 5.1 Live Control Tower (home page)

- **KPI cards**
  - **Active clients:** people not marked "exited".
  - **Check-in adherence (7 days):** completed check-ins as a share of all check-ins due in the last week (for example 79 / 90 = 88%). Shows "–" until there are check-ins.
  - **Open escalations:** unresolved escalations, with how many are high or critical.
- **7-day stability chart:** for each of the last seven days, how many people were stable, watch or critical on that day.
- **Cohort:** everyone you can see, worst first, with their status dot, reference and programme day. Click a name to open the profile.
- **Live activity:** the latest check-ins, missed check-ins, CBT exercises, logistics, escalations and overrides.

Key workers see figures for **their caseload**. Leads, admins and viewers see the **whole organisation**. Viewers get the cards and chart only, with a note that individual records are hidden.

**Status dots**

| Dot | Meaning |
|---|---|
| 🔴 Critical | An unresolved **high** or **critical** escalation |
| 🟡 Watch | Any other unresolved escalation, a missed check-in in the last 48 hours, or a **high** risk tier |
| 🟢 Stable | None of the above |

### 5.2 Service users (cohort list)

Search by name or reference, and sort by any column: stability, programme day, risk tier, key worker, open escalations or last check-in. Leads and admins can **Add a service user**:

| Field | Notes |
|---|---|
| Name | First name and initial is enough ("Jordan K."). Use as little identifying detail as possible. |
| Reference | Format `RE-12345`, unique in the organisation. |
| Release date | Day 1 of the programme. The programme day counts from here. |
| Risk tier | Low, moderate, moderate-high, high. |
| Key worker | Who the person is assigned to. Only they (plus leads and admins) can see the person. |

A default support profile is created with each new service user.

### 5.3 Service user profile

The header shows the status dot, programme day, risk tier, consent and key worker. Opening a profile is **itself recorded** in the audit trail.

**Clinical profile configuration.** These settings drive the conversation. Every save creates a new **version** and is logged.

| Setting | What it does |
|---|---|
| Primary risk pathway | The main area of risk: substance use, housing instability, financial stress or interpersonal conflict. |
| Active CBT module | The exercise the assistant offers when they're struggling: distress tolerance, cognitive reframing, emotional regulation, urge surfing or radical acceptance. |
| Check-in frequency | Twice daily, daily, every other day or weekly. |
| Sentiment dip (days) | How many days of low mood before an escalation is raised (1–14). |
| Missed check-ins before escalating | How many check-ins in a row can be missed before an escalation (1–10). |
| Keyword sensitivity (1–10) | How sensitive the risk screen is. **1–3:** only self-harm and harm-to-others phrases. **4–6:** adds relapse. **7–10:** also flags distress ("hopeless", "can't cope") and housing loss ("kicked out", "sleeping rough"). Self-harm and harm to others are always screened. |

**Status and assignment:** key worker, risk tier, status (active, paused or exited) and consent. Only leads and admins can change the key worker.

**Escalations:** this person's unresolved escalations, with **Acknowledge** and **Resolve**. Resolving asks what was done, and that note goes in the record.

**Actions:** follow-ups agreed with or for the person. Add one with an optional due date; it is assigned to you. Tick it when done (untick to reopen). Overdue actions show in red. The last five done actions are listed under "Recently done".

**Case notes:** what happened, what was agreed and how they seemed. Notes are always saved in your name and with the time. Only the author can edit a note, and only leads and admins can delete one. Every change is in the audit trail.

**WhatsApp preview (simulated):** see section 6.

**Configuration audit trail:** everything that happened to this person's record, newest first, with who did it. That covers record opened, profile changed (and which fields), escalations opened and handled, case notes and actions. Nobody can edit or delete these entries.

**Live activity:** this person's recent activity events.

### 5.4 Escalation queue

- **Needs attention:** open and acknowledged escalations, oldest first.
- **Resolved:** the history, with the resolution note.

Each card shows severity, trigger (keyword, sentiment dip, missed check-ins, raised by staff, asked for help), status, who it's for and how long ago it opened. Acknowledge and resolve work the same way as on the profile.

### 5.5 Team (organisation admins)

Invite staff (name, email, role), change someone's role, or disable an account. You can't change your own role, which stops an admin locking themselves out.

### 5.6 Settings (organisation admins)

The organisation's display name and logos (light and dark mode). Logos are stored privately and are only visible to members of your organisation.

---

## 6. The WhatsApp preview

The preview shows the Phase 2 conversation working inside the Control Tower, for demos and staff training.

- **Type as the service user** would, and press **Send**.
- **Try a mood score** ("3", or "mood 7"). It is logged as a check-in, and a low score gets an offer of support.
- **Mention cravings, stress or feeling low.** The assistant sends the profile's **CBT exercise**, and a "CBT exercise sent" event is logged.
- **Ask about an appointment, the bus or Universal Credit.** That gets a logistics reply, and "Asked for help with logistics" is logged.
- **Say something risky** ("I want to end it all", "I'm using again"):
  - an escalation opens (you'll see it on the profile and in the queue, and the dot turns red)
  - the assistant pauses
  - the person gets a handover message, plus crisis contacts if the match was critical.
- **Simulate: nobody acknowledges within 15 minutes:** shows the automatic crisis-contacts message the person would get.
- **Resolve the escalation** and the assistant starts replying again.
- **Restart** (circular arrow) starts the conversation again.

The preview is a simulation:
- nothing is sent to WhatsApp
- the messages themselves are never saved
- the replies are scripted, with no AI
- the **escalations and activity events it creates are real records**, which is what makes it useful for training.

---

## 7. Running a client demo

### The hosted demo

The hosted demo runs entirely in the browser on invented data. There is nothing to install and nothing leaves the browser. Refreshing the page puts the data back to the start, and it is the same every time, so you can rehearse.

The **Switch demo user** button (top right) changes who you are:

| Demo user | Role | What it shows |
|---|---|---|
| Jane Doe | Organisation admin | Everything, including Team and Settings |
| Sam Okafor | Clinical lead | Every service user, no Team page |
| Mo Rahman, Ellie Hughes, Dan Price | Key workers | Only their own caseload |
| Vic Turner | Viewer | Aggregate figures only |

### A 10-minute demo script

1. **Control Tower as Jane (admin), 1 min.** "This is the whole organisation at a glance." Point at the red and amber dots, adherence and open escalations.
2. **Open a red-dot person, 3 min.**
   - Walk through the profile configuration: the risk pathway, the CBT module and the keyword sensitivity.
   - Change the CBT module and save. Point out that the version goes up and the audit trail shows who changed what.
3. **WhatsApp preview, 3 min.**
   - Send "4" (check-in), then "bad cravings tonight" (CBT exercise).
   - Then send "I've relapsed, using again". The escalation opens, the dot turns red and replies pause.
   - Click **Simulate: nobody acknowledges** to show the crisis contacts.
   - Resolve the escalation with a note; replies resume.
4. **Case note and action, 1 min.** Write "Called back, safe tonight", add "Call again at 9am", then show both in the audit trail.
5. **Switch to Mo (key worker), 1 min.** "Mo only sees his own caseload; the database enforces it."
6. **Switch to Vic (viewer), 1 min.** "Commissioners get the numbers, never the people."

### The full system

To show real sign-in, the real database rules and the real audit log, run the full stack locally (needs Node and Docker):

```
make install && make start
npx supabase db reset --local && make seed-demo
```

Then open http://localhost:5173. The demo accounts are:
- `admin@northbridge.example.test`
- `lead@northbridge.example.test`
- `keyworker1@northbridge.example.test`
- `keyworker2@northbridge.example.test`
- `viewer@northbridge.example.test`

The same five accounts exist with `@harbourside.example.test`. The password is `demo-password` for all of them. Sign in as Northbridge and Harbourside users side by side to show that the two organisations can never see each other's data.

---

## 8. Data protection and security (summary)

- **Tenant isolation in the database.** Every record belongs to one organisation. Postgres row-level security decides what each signed-in person can read or write, on every table.
- **Least privilege.** Key workers see only their assigned people, and viewers see no individual records.
- **Audit everything.** Every create, update and delete on service users, profiles, escalations, activity, case notes and actions is written to an append-only audit log by database triggers, and so is every profile opened. Nobody can edit or delete audit entries, not even administrators.
- **No public files.** The only files stored are staff avatars and organisation logos, in a private bucket, shown through short-lived signed links.
- **UK/EU hosting.** The database is hosted in a UK or EU region. The old CRM features that sent data to US services (avatar and logo lookups) have been removed.
- **Synthetic data only in Phase 1.**

---

## 9. Known limits in Phase 1

- **The WhatsApp engine is not connected.** The preview is a simulation, and check-ins in the demo data are generated.
- **Response times aren't enforced yet.** The "nobody acknowledges in time" crisis message is simulated in the preview; Phase 2 sends it automatically.
- **No real-time push.** Use the refresh button (or pull down on mobile) to fetch the latest data.
- **Viewer anonymity.** Viewers see organisation-wide aggregates. A minimum cohort size before figures are shown (to stop small numbers identifying people) is still to be agreed.
- **Hosted demo.** The audit log and role rules are imitated in the browser and reset on reload.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| Programme day | Days since release, counting the release date as day 1. |
| Escalation | A risk event needing a person: opened, then acknowledged, then resolved. |
| Risk screen | Fixed keyword rules applied to every message before anything else. No AI. |
| Support profile | The per-person configuration of check-ins, CBT module and escalation thresholds. |
| Case note | A free-text record written by staff about a service user. |
| Action | A follow-up with an optional due date, ticked off when done. |
| Audit trail | The append-only history of who changed or opened a record, and when. |
