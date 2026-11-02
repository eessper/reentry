import faker from "faker/locale/en";

import { generateSales } from "./sales";
import { generateServiceUsers } from "./serviceUsers";
import type { Db } from "./types";

// Same names and numbers on every load, so a demo can be rehearsed
const DEMO_SEED = 20261102;

export default (): Db => {
  faker.seed(DEMO_SEED);
  const db = {} as Db;
  db.sales = generateSales(db);
  const { serviceUsers, profiles, escalations, events, notes, actions } =
    generateServiceUsers(db);
  db.service_users = serviceUsers;
  db.support_profiles = profiles;
  db.escalations = escalations;
  db.activity_events = events;
  db.case_notes = notes;
  db.case_actions = actions;
  db.configuration = [
    {
      id: 1,
      config: {} as Db["configuration"][number]["config"],
    },
  ];
  return db;
};
