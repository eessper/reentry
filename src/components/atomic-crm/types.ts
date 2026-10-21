import type { Identifier, RaRecord } from "ra-core";

export type SignUpData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

/** A staff member's role in their organisation (memberships.role). */
export type MembershipRole =
  | "org_admin"
  | "clinical_lead"
  | "key_worker"
  | "viewer";

export const MEMBERSHIP_ROLES: readonly MembershipRole[] = [
  "org_admin",
  "clinical_lead",
  "key_worker",
  "viewer",
];

export type SalesFormData = {
  avatar?: string;
  email: string;
  secondary_emails?: string[];
  password?: string;
  first_name: string;
  last_name: string;
  role: MembershipRole;
  disabled: boolean;
};

export type Sale = {
  first_name: string;
  last_name: string;
  role: MembershipRole;
  avatar?: RAFile;
  disabled?: boolean;
  user_id: string;

  /**
   * This is a copy of the user's email, to make it easier to handle by react admin
   * DO NOT UPDATE this field directly, it should be updated by the backend
   */
  email: string;

  secondary_emails?: string[];

  /**
   * This is used by the fake rest provider to store the password
   * DO NOT USE this field in your code besides the fake rest provider
   * @deprecated
   */
  password?: string;
} & Pick<RaRecord, "id">;

export interface RAFile {
  src: string;
  title: string;
  path?: string;
  rawFile: File;
  type?: string;
}

// Re-entry: service users and the Control Tower (supabase/schemas/08_service_users.sql)

export type RiskTier = "low" | "moderate" | "moderate_high" | "high";
export type Stability = "stable" | "watch" | "critical";
export type RiskPathway =
  | "substance_use"
  | "housing_instability"
  | "financial_stress"
  | "interpersonal_conflict";
export type CbtModule =
  | "distress_tolerance"
  | "cognitive_reframing"
  | "emotional_regulation"
  | "urge_surfing"
  | "radical_acceptance";
export type CheckinFrequency =
  | "twice_daily"
  | "daily"
  | "every_other_day"
  | "weekly";
export type EscalationStatus = "open" | "acknowledged" | "resolved";
export type EscalationSeverity = "low" | "medium" | "high" | "critical";
export type EscalationTrigger =
  | "keyword"
  | "sentiment_dip"
  | "missed_checkins"
  | "manual"
  | "self_referral";
export type ActivityEventType =
  | "checkin"
  | "missed_checkin"
  | "cbt_deploy"
  | "logistics"
  | "escalation"
  | "override"
  | "profile_change";

export const RISK_TIERS: readonly RiskTier[] = [
  "low",
  "moderate",
  "moderate_high",
  "high",
];
export const RISK_PATHWAYS: readonly RiskPathway[] = [
  "substance_use",
  "housing_instability",
  "financial_stress",
  "interpersonal_conflict",
];
export const CBT_MODULES: readonly CbtModule[] = [
  "distress_tolerance",
  "cognitive_reframing",
  "emotional_regulation",
  "urge_surfing",
  "radical_acceptance",
];
export const CHECKIN_FREQUENCIES: readonly CheckinFrequency[] = [
  "twice_daily",
  "daily",
  "every_other_day",
  "weekly",
];
export const ESCALATION_TRIGGERS: readonly EscalationTrigger[] = [
  "keyword",
  "sentiment_dip",
  "missed_checkins",
  "manual",
  "self_referral",
];
export const ESCALATION_SEVERITIES: readonly EscalationSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

/** A row of the service_users_summary view (service_users plus derived fields). */
export type ServiceUser = {
  id: Identifier;
  display_name: string;
  reference_code: string;
  release_date: string;
  programme_day: number;
  risk_tier: RiskTier;
  assigned_worker_id: Identifier | null;
  consent_status: "pending" | "given" | "withdrawn";
  status: "active" | "paused" | "exited";
  nb_open_escalations: number;
  stability: Stability;
  last_checkin_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportProfile = {
  id: Identifier;
  service_user_id: Identifier;
  primary_risk_pathway: RiskPathway | null;
  active_cbt_module: CbtModule | null;
  checkin_frequency: CheckinFrequency;
  sentiment_dip_days: number;
  missed_checkins_threshold: number;
  keyword_sensitivity: number;
  version: number;
  updated_at: string;
  updated_by: Identifier | null;
};

export type Escalation = {
  id: Identifier;
  service_user_id: Identifier;
  trigger_type: EscalationTrigger;
  severity: EscalationSeverity;
  status: EscalationStatus;
  assigned_to: Identifier | null;
  opened_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  notes: string | null;
};

export type ActivityEvent = {
  id: Identifier;
  service_user_id: Identifier;
  type: ActivityEventType;
  summary: string;
  actor_sales_id: Identifier | null;
  created_at: string;
};

export type StabilityDay = {
  day: string;
  stable: number;
  watch: number;
  critical: number;
};

/** What control_tower_stats() returns: aggregates only, no individual records. */
export type ControlTowerStats = {
  scope: "organisation" | "caseload";
  active_clients: number;
  checkins_completed: number;
  checkins_missed: number;
  checkin_adherence: number | null;
  open_escalations: number;
  urgent_escalations: number;
  stability: StabilityDay[];
};

/** A row of service_user_history(): one audit log entry with its actor's name. */
export type AuditTrailEntry = {
  id: Identifier;
  created_at: string;
  action: "create" | "update" | "delete" | "view";
  table_name: string;
  record_id: string;
  actor_name: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
