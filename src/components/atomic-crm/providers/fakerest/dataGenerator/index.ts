import { generateSales } from "./sales";
import { generateServiceUsers } from "./serviceUsers";
import type { Db } from "./types";

export default (): Db => {
  const db = {} as Db;
  db.sales = generateSales(db);
  const { serviceUsers, profiles, escalations, events } =
    generateServiceUsers(db);
  db.service_users = serviceUsers;
  db.support_profiles = profiles;
  db.escalations = escalations;
  db.activity_events = events;
  db.configuration = [
    {
      id: 1,
      config: {} as Db["configuration"][number]["config"],
    },
  ];
  return db;
};
