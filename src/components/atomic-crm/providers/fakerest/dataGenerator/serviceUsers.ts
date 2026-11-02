import faker from "faker/locale/en";

import type {
  ActivityEvent,
  CaseAction,
  CaseNote,
  Escalation,
  RiskTier,
  ServiceUser,
  SupportProfile,
} from "../../../types";
import {
  CBT_MODULES,
  CHECKIN_FREQUENCIES,
  RISK_PATHWAYS,
  RISK_TIERS,
} from "../../../types";
import { demoStability } from "../internal/demoStability";
import type { Db } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const NOTE_SCRIPT = [
  "Met at the hostel. Settling in, worried about money until the first Universal Credit payment.",
  "Phone call. Went to the GP registration on their own, mood better than last week.",
];

const ACTION_SCRIPT = [
  "Chase Universal Credit advance",
  "Book GP registration",
  "Confirm probation appointment and travel",
];

/**
 * Demo-mode service users, shaped like rows of the service_users_summary
 * view (with programme_day and stability already worked out), assigned to
 * the demo key workers. Names are invented: first name and initial.
 */
export const generateServiceUsers = (db: Db) => {
  const keyWorkers = db.sales.filter((sale) => sale.role === "key_worker");
  const serviceUsers: ServiceUser[] = [];
  const profiles: SupportProfile[] = [];
  const escalations: Escalation[] = [];
  const events: ActivityEvent[] = [];
  const notes: CaseNote[] = [];
  const actions: CaseAction[] = [];

  for (let id = 1; id <= 15; id++) {
    const daysSinceRelease =
      id <= 3 ? id - 1 : faker.datatype.number({ min: 3, max: 88 });
    const risk_tier = faker.random.arrayElement(RISK_TIERS as RiskTier[]);
    const ownEscalations: Escalation[] =
      id % 4 === 0
        ? [
            {
              id: escalations.length + 1,
              service_user_id: id,
              trigger_type: faker.random.arrayElement([
                "keyword",
                "missed_checkins",
                "sentiment_dip",
              ]),
              severity: id % 8 === 0 ? "high" : "medium",
              status: "open",
              assigned_to: null,
              opened_at: new Date(Date.now() - DAY_MS).toISOString(),
              acknowledged_at: null,
              resolved_at: null,
              notes: "Raised by the demo check-in rules.",
            },
          ]
        : [];
    escalations.push(...ownEscalations);

    serviceUsers.push({
      id,
      display_name: `${faker.name.firstName()} ${faker.name.lastName()[0]}.`,
      reference_code: `RE-${String(10000 + id * 397)}`,
      release_date: new Date(Date.now() - daysSinceRelease * DAY_MS)
        .toISOString()
        .slice(0, 10),
      programme_day: daysSinceRelease + 1,
      risk_tier,
      assigned_worker_id: keyWorkers.length
        ? keyWorkers[id % keyWorkers.length].id
        : null,
      consent_status: "given",
      status: "active",
      nb_open_escalations: ownEscalations.length,
      // Recomputed on every read by the demo provider
      stability: demoStability({ id, risk_tier }, ownEscalations, []),
      last_checkin_at: new Date(Date.now() - (id % 3) * DAY_MS).toISOString(),
      created_at: new Date(
        Date.now() - daysSinceRelease * DAY_MS,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    });

    profiles.push({
      id,
      service_user_id: id,
      primary_risk_pathway: faker.random.arrayElement([...RISK_PATHWAYS]),
      active_cbt_module: faker.random.arrayElement([...CBT_MODULES]),
      checkin_frequency: faker.random.arrayElement([...CHECKIN_FREQUENCIES]),
      sentiment_dip_days: 3,
      missed_checkins_threshold: 2,
      keyword_sensitivity: 5,
      version: 1,
      updated_at: new Date().toISOString(),
      updated_by: null,
    });

    for (
      let daysAgo = 0;
      daysAgo < Math.min(7, daysSinceRelease + 1);
      daysAgo++
    ) {
      const isMissed = faker.datatype.number({ min: 1, max: 10 }) <= 2;
      events.push({
        id: events.length + 1,
        service_user_id: id,
        type: isMissed ? "missed_checkin" : "checkin",
        summary: isMissed
          ? "Missed the morning check-in"
          : `Check-in completed, mood ${faker.datatype.number({ min: 3, max: 9 })}/10`,
        actor_sales_id: null,
        created_at: new Date(
          Date.now() - daysAgo * DAY_MS - 3 * 60 * 60 * 1000,
        ).toISOString(),
      });
    }
  }

  for (const serviceUser of serviceUsers.slice(0, 8)) {
    const author = serviceUser.assigned_worker_id;
    NOTE_SCRIPT.slice(0, 1 + (Number(serviceUser.id) % 2)).forEach(
      (body, index) => {
        const createdAt = new Date(
          Date.now() - (index + 1) * DAY_MS,
        ).toISOString();
        notes.push({
          id: notes.length + 1,
          service_user_id: serviceUser.id,
          author_sales_id: author,
          body,
          created_at: createdAt,
          updated_at: createdAt,
        });
      },
    );
    ACTION_SCRIPT.slice(0, 1 + (Number(serviceUser.id) % 3)).forEach(
      (title, index) => {
        actions.push({
          id: actions.length + 1,
          service_user_id: serviceUser.id,
          title,
          due_date: new Date(Date.now() + (index * 2 - 1) * DAY_MS)
            .toISOString()
            .slice(0, 10),
          assigned_to: author,
          done_at: null,
          created_by: author,
          created_at: new Date(Date.now() - 2 * DAY_MS).toISOString(),
        });
      },
    );
  }

  return { serviceUsers, profiles, escalations, events, notes, actions };
};
