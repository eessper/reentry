import {
  CBT_MODULES,
  CHECKIN_FREQUENCIES,
  RISK_PATHWAYS,
  RISK_TIERS,
} from "../types";

const toChoices = (values: readonly string[], prefix: string) =>
  values.map((value) => ({ id: value, name: `${prefix}.${value}` }));

export const riskTierChoices = toChoices(
  RISK_TIERS,
  "resources.service_users.risk_tiers",
);
export const statusChoices = toChoices(
  ["active", "paused", "exited"],
  "resources.service_users.statuses",
);
export const consentChoices = toChoices(
  ["pending", "given", "withdrawn"],
  "resources.service_users.consent",
);
export const pathwayChoices = toChoices(
  RISK_PATHWAYS,
  "resources.support_profiles.pathways",
);
export const moduleChoices = toChoices(
  CBT_MODULES,
  "resources.support_profiles.modules",
);
export const frequencyChoices = toChoices(
  CHECKIN_FREQUENCIES,
  "resources.support_profiles.frequencies",
);
