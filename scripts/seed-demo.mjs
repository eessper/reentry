// Loads synthetic demo data: two organisations, each with an org admin, a
// clinical lead, two key workers and a viewer, 15 service users with support
// profiles, a few open escalations and a week of activity.
//
// Every name, reference code and event is invented. The data is generated
// from a fixed seed, so every run produces the same demo.
//
// Usage (local stack):
//   make seed-demo
// or:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/seed-demo.mjs --password <password for every demo account>
//
// Staff sign in with <role>@<organisation>.example.test, e.g.
// keyworker1@northbridge.example.test, and the password given above.
//
// It refuses to run against anything but a local Supabase unless you pass
// --allow-remote, because it creates accounts with a shared, known password.
// Run it on an empty database (`npx supabase db reset --local`); it stops if
// the demo organisations already exist.

import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    password: { type: "string" },
    "allow-remote": { type: "boolean", default: false },
  },
});

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}
if (!values.password || values.password.length < 8) {
  fail(
    "Pass --password <password> (8 characters or more) for the demo accounts.",
  );
}
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
if (!isLocal && !values["allow-remote"]) {
  fail(
    `Refusing to seed ${url}: demo accounts share a known password. Pass --allow-remote if this really is a demo project.`,
  );
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

// Small seeded random generator (mulberry32), so the demo is reproducible.
const createRandom = (seed) => {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
  };
};

const ORGANISATIONS = [
  {
    name: "Northbridge Probation Region (Demo)",
    domain: "northbridge.example.test",
    seed: 1101,
  },
  {
    name: "Harbourside Re-entry Trust (Demo)",
    domain: "harbourside.example.test",
    seed: 2202,
  },
];

const STAFF = [
  { key: "admin", role: "org_admin", title: "Organisation admin" },
  { key: "lead", role: "clinical_lead", title: "Clinical lead" },
  { key: "keyworker1", role: "key_worker", title: "Key worker" },
  { key: "keyworker2", role: "key_worker", title: "Key worker" },
  { key: "viewer", role: "viewer", title: "Viewer" },
];

// Invented first names and surnames, combined at random; service users are
// shown as first name and initial.
const FIRST_NAMES = [
  "Ari",
  "Bex",
  "Cal",
  "Dara",
  "Eli",
  "Fen",
  "Gus",
  "Hollis",
  "Ira",
  "Jem",
  "Kit",
  "Lark",
  "Milo",
  "Nell",
  "Oz",
  "Pip",
  "Quin",
  "Rory",
  "Sol",
  "Tam",
  "Uri",
  "Vale",
  "Wren",
  "Xan",
  "Yael",
  "Zed",
];
const SURNAMES = [
  "Ashdown",
  "Brackley",
  "Carrow",
  "Dunmere",
  "Eastwold",
  "Farrowby",
  "Glenholt",
  "Harwick",
  "Ivesby",
  "Kestell",
  "Lowther",
  "Marchetti",
  "Northam",
  "Oakhurst",
  "Penhallow",
  "Quarrie",
  "Redfern",
  "Sallow",
  "Thornbury",
  "Underhill",
  "Varley",
  "Whitlock",
];

const RISK_TIERS = ["low", "moderate", "moderate", "moderate_high", "high"];
const PATHWAYS = [
  "substance_use",
  "housing_instability",
  "financial_stress",
  "interpersonal_conflict",
];
const MODULES = [
  "distress_tolerance",
  "cognitive_reframing",
  "emotional_regulation",
  "urge_surfing",
  "radical_acceptance",
];
const FREQUENCY_BY_TIER = {
  low: "every_other_day",
  moderate: "daily",
  moderate_high: "daily",
  high: "twice_daily",
};
const MODULE_LABELS = {
  distress_tolerance: "Distress tolerance",
  cognitive_reframing: "Cognitive reframing",
  emotional_regulation: "Emotional regulation",
  urge_surfing: "Urge surfing",
  radical_acceptance: "Radical acceptance",
};
const LOGISTICS = [
  "Reminder sent: probation appointment tomorrow at 10:00",
  "Bus route to the housing office shared",
  "Benefits appointment confirmed for Thursday",
  "GP registration form link sent",
  "Address for the Jobcentre shared",
  "Food bank opening hours sent",
];
const ESCALATIONS = [
  {
    trigger_type: "keyword",
    severity: "high",
    notes: "Message mentioned feeling unsafe at night.",
  },
  {
    trigger_type: "missed_checkins",
    severity: "medium",
    notes: "No reply to the last three check-ins.",
  },
  {
    trigger_type: "sentiment_dip",
    severity: "medium",
    notes: "Mood scores down for four days running.",
  },
  {
    trigger_type: "self_referral",
    severity: "high",
    notes: "Asked to speak to someone today.",
  },
  {
    trigger_type: "keyword",
    severity: "critical",
    notes: "Mentioned using again; crisis contacts sent.",
  },
];

const at = (daysAgo, hour, minute = 0) => {
  const date = new Date(NOW - daysAgo * DAY_MS);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
};

const check = (result, what) => {
  if (result.error) {
    fail(`Could not ${what}: ${result.error.message}`);
  }
  return result.data;
};

const createStaff = async (random, organisation) => {
  const staff = {};
  for (const member of STAFF) {
    const email = `${member.key}@${organisation.domain}`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: values.password,
      email_confirm: true,
      user_metadata: {
        first_name: random.pick(FIRST_NAMES),
        last_name: random.pick(SURNAMES),
      },
      app_metadata: { organisation_id: organisation.id, role: member.role },
    });
    if (error) {
      fail(`Could not create ${email}: ${error.message}`);
    }
    const sale = check(
      await supabase
        .from("sales")
        .select("id")
        .eq("user_id", data.user.id)
        .single(),
      `read the staff profile of ${email}`,
    );
    staff[member.key] = { ...member, email, salesId: sale.id };
  }
  return staff;
};

const buildServiceUsers = (random, organisation, staff) => {
  const usedCodes = new Set();
  const usedNames = new Set();
  return Array.from({ length: 15 }, (_, index) => {
    let code;
    do {
      code = `RE-${String(random.int(10000, 99999))}`;
    } while (usedCodes.has(code));
    usedCodes.add(code);

    let name;
    do {
      name = `${random.pick(FIRST_NAMES)} ${random.pick(SURNAMES)[0]}.`;
    } while (usedNames.has(name));
    usedNames.add(name);

    // A few people in their first 72 hours, the rest spread over 90 days.
    const daysSinceRelease = index < 3 ? random.int(0, 2) : random.int(3, 88);
    return {
      organisation_id: organisation.id,
      display_name: name,
      reference_code: code,
      release_date: new Date(NOW - daysSinceRelease * DAY_MS)
        .toISOString()
        .slice(0, 10),
      risk_tier: random.pick(RISK_TIERS),
      assigned_worker_id: (index % 2 === 0
        ? staff.keyworker1
        : staff.keyworker2
      ).salesId,
      consent_status: index === 14 ? "pending" : "given",
      status: index === 13 ? "paused" : "active",
    };
  });
};

const buildProfile = (random, serviceUser, staff) => ({
  primary_risk_pathway: random.pick(PATHWAYS),
  active_cbt_module: random.pick(MODULES),
  checkin_frequency: FREQUENCY_BY_TIER[serviceUser.risk_tier],
  sentiment_dip_days: serviceUser.risk_tier === "high" ? 2 : random.int(3, 5),
  missed_checkins_threshold:
    serviceUser.risk_tier === "high" ? 1 : random.int(2, 3),
  keyword_sensitivity: serviceUser.risk_tier === "high" ? 8 : random.int(4, 7),
  updated_by: staff.lead.salesId,
});

// One week of the feed: check-ins (missed more often for higher risk), CBT
// exercises, logistics help and the occasional key worker override.
const buildActivity = (random, organisation, serviceUser, profile) => {
  const missRate = { low: 0.05, moderate: 0.1, moderate_high: 0.2, high: 0.3 }[
    serviceUser.risk_tier
  ];
  const daysInProgramme = Math.floor(
    (NOW - Date.parse(serviceUser.release_date)) / DAY_MS,
  );
  const events = [];
  for (let daysAgo = Math.min(6, daysInProgramme); daysAgo >= 0; daysAgo--) {
    const base = {
      organisation_id: organisation.id,
      service_user_id: serviceUser.id,
    };
    if (random.chance(missRate)) {
      events.push({
        ...base,
        type: "missed_checkin",
        summary: "Missed the scheduled check-in",
        created_at: at(daysAgo, 9, 30),
      });
    } else {
      const mood = random.int(serviceUser.risk_tier === "high" ? 2 : 4, 9);
      events.push({
        ...base,
        type: "checkin",
        summary: `Check-in completed, mood ${mood}/10`,
        created_at: at(daysAgo, 9, random.int(0, 50)),
      });
    }
    if (random.chance(0.35)) {
      events.push({
        ...base,
        type: "cbt_deploy",
        summary: `${MODULE_LABELS[profile.active_cbt_module]} exercise sent`,
        created_at: at(daysAgo, 13, random.int(0, 59)),
      });
    }
    if (random.chance(0.3)) {
      events.push({
        ...base,
        type: "logistics",
        summary: random.pick(LOGISTICS),
        created_at: at(daysAgo, 16, random.int(0, 59)),
      });
    }
  }
  return events;
};

const seedOrganisation = async (definition) => {
  const random = createRandom(definition.seed);
  const organisation = check(
    await supabase
      .from("organisations")
      .insert({ name: definition.name })
      .select()
      .single(),
    `create ${definition.name}`,
  );
  const scoped = { ...definition, id: organisation.id };
  const staff = await createStaff(random, scoped);

  const serviceUsers = check(
    await supabase
      .from("service_users")
      .insert(buildServiceUsers(random, scoped, staff))
      .select(),
    "create service users",
  );

  const events = [];
  for (const serviceUser of serviceUsers) {
    const profile = buildProfile(random, serviceUser, staff);
    check(
      await supabase
        .from("support_profiles")
        .update(profile)
        .eq("service_user_id", serviceUser.id),
      `configure the profile of ${serviceUser.reference_code}`,
    );
    events.push(...buildActivity(random, scoped, serviceUser, profile));
  }

  // Escalations for the higher-risk people: some open, one acknowledged,
  // one resolved earlier in the week.
  const atRisk = serviceUsers
    .filter(
      (serviceUser) =>
        serviceUser.risk_tier === "high" ||
        serviceUser.risk_tier === "moderate_high",
    )
    .slice(0, 5);
  const escalations = atRisk.map((serviceUser, index) => {
    const template = ESCALATIONS[index % ESCALATIONS.length];
    const status =
      index < 3 ? "open" : index === 3 ? "acknowledged" : "resolved";
    const openedDaysAgo = status === "resolved" ? 4 : random.int(1, 2);
    return {
      organisation_id: organisation.id,
      service_user_id: serviceUser.id,
      trigger_type: template.trigger_type,
      severity: template.severity,
      status,
      assigned_to: serviceUser.assigned_worker_id,
      notes: template.notes,
      opened_at: at(openedDaysAgo, 10, random.int(0, 59)),
      acknowledged_at: status === "open" ? null : at(openedDaysAgo, 11),
      resolved_at: status === "resolved" ? at(openedDaysAgo - 1, 15) : null,
    };
  });
  check(
    await supabase.from("escalations").insert(escalations),
    "create escalations",
  );

  for (const escalation of escalations) {
    events.push({
      organisation_id: organisation.id,
      service_user_id: escalation.service_user_id,
      type: "escalation",
      summary: `Escalation opened (${escalation.trigger_type.replace("_", " ")}, ${escalation.severity})`,
      created_at: escalation.opened_at,
    });
  }
  const overridden = serviceUsers.find(
    (serviceUser) => serviceUser.status === "paused",
  );
  if (overridden) {
    events.push({
      organisation_id: organisation.id,
      service_user_id: overridden.id,
      type: "override",
      summary: "Key worker paused automated check-ins while in hospital",
      actor_sales_id: overridden.assigned_worker_id,
      created_at: at(2, 12),
    });
  }
  // Today's events later than now haven't happened yet.
  const pastEvents = events.filter(
    (event) => Date.parse(event.created_at) <= NOW,
  );
  check(
    await supabase.from("activity_events").insert(pastEvents),
    "create activity events",
  );

  return {
    organisation,
    staff,
    serviceUsers: serviceUsers.length,
    escalations: escalations.length,
    events: pastEvents.length,
  };
};

const { data: existing } = await supabase
  .from("organisations")
  .select("name")
  .in(
    "name",
    ORGANISATIONS.map((organisation) => organisation.name),
  );
if (existing?.length) {
  fail(
    `Demo organisations already exist (${existing.map((organisation) => organisation.name).join(", ")}). Reset the database first: npx supabase db reset --local`,
  );
}

for (const definition of ORGANISATIONS) {
  const result = await seedOrganisation(definition);
  process.stdout.write(
    `${result.organisation.name}: ${result.serviceUsers} service users, ${result.escalations} escalations, ${result.events} activity events\n` +
      Object.values(result.staff)
        .map((member) => `  ${member.title.padEnd(20)} ${member.email}\n`)
        .join(""),
  );
}
process.stdout.write(
  "All demo accounts use the password you passed with --password.\n",
);
