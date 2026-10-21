import { ESCALATION_SEVERITIES, ESCALATION_TRIGGERS } from "../types";

export const severityChoices = ESCALATION_SEVERITIES.map((severity) => ({
  id: severity,
  name: `resources.escalations.severities.${severity}`,
}));

export const triggerChoices = ESCALATION_TRIGGERS.map((trigger) => ({
  id: trigger,
  name: `resources.escalations.triggers.${trigger}`,
}));
