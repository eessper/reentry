// The database enums the conversation rules use (08_service_users.sql).
// Kept here, not imported from the web app, so edge functions can use the
// rules too; the web app's types in src/components/atomic-crm/types.ts are
// the same unions.

export type EscalationSeverity = "low" | "medium" | "high" | "critical";

export type ActivityEventType =
  | "checkin"
  | "missed_checkin"
  | "cbt_deploy"
  | "logistics"
  | "escalation"
  | "override"
  | "profile_change";

export type CbtModule =
  | "distress_tolerance"
  | "cognitive_reframing"
  | "emotional_regulation"
  | "urge_surfing"
  | "radical_acceptance";
