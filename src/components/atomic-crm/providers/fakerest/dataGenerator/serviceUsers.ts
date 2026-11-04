import faker from "faker/locale/en";

import type {
  ActivityEvent,
  Escalation,
  RiskTier,
  ServiceUser,
  Stability,
  SupportProfile,
} from "../../../types";
import {
  CBT_MODULES,
  CHECKIN_FREQUENCIES,
  RISK_PATHWAYS,
  RISK_TIERS,
} from "../../../types";
import type { Db } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const stabilityOf = (tier: RiskTier, escalations: Escalation[]): Stability => {
  const open = escalations.filter(
    (escalation) => escalation.status !== "resolved",
  );
  if (open.some((e) => e.severity === "high" || e.severity === "critical")) {
    return "critical";
  }
  return open.length > 0 || tier === "high" ? "watch" : "stable";
};

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
      stability: stabilityOf(risk_tier, ownEscalations),
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
      events.push({
        id: events.length + 1,
        service_user_id: id,
        type: "checkin",
        summary: `Check-in completed, mood ${faker.datatype.number({ min: 3, max: 9 })}/10`,
        actor_sales_id: null,
        created_at: new Date(
          Date.now() - daysAgo * DAY_MS - 3 * 60 * 60 * 1000,
        ).toISOString(),
      });
    }
  }

  return { serviceUsers, profiles, escalations, events };
};
