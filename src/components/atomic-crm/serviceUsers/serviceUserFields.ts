import type { AuditTrailEntry, ServiceUser, SupportProfile } from "../types";

const REFERENCE_CODE = /^RE-[0-9]{5}$/;

/** Reference codes look like RE-12345 (the database checks the same). */
export const validateReferenceCode = (value: string) =>
  value && !REFERENCE_CODE.test(value)
    ? "resources.service_users.validation.reference_code"
    : undefined;

const CONFIGURABLE_FIELDS = [
  "primary_risk_pathway",
  "active_cbt_module",
  "checkin_frequency",
  "sentiment_dip_days",
  "missed_checkins_threshold",
  "keyword_sensitivity",
] as const;

/** Sends only the configuration fields; the database versions the rest. */
export const pickConfiguration = (values: Partial<SupportProfile>) =>
  Object.fromEntries(
    CONFIGURABLE_FIELDS.map((field) => [field, values[field]]),
  );

const EDITABLE_FIELDS = [
  "risk_tier",
  "status",
  "consent_status",
  "assigned_worker_id",
] as const;

/**
 * Sends only the service user's own columns: the record comes from the
 * summary view, whose derived fields the table doesn't have. Key workers
 * can't reassign, so their saves leave the key worker out.
 */
export const pickEditableFields = (
  values: Partial<ServiceUser>,
  canAssign: boolean,
) =>
  Object.fromEntries(
    EDITABLE_FIELDS.filter(
      (field) => canAssign || field !== "assigned_worker_id",
    ).map((field) => [field, values[field]]),
  );

// Bookkeeping columns that change on every save and say nothing new.
const IGNORED_FIELDS = new Set(["updated_at", "updated_by", "version", "fts"]);

/** The fields an audited update changed, in the order they appear. */
export const changedFields = (entry: AuditTrailEntry): string[] => {
  if (entry.action !== "update" || !entry.before || !entry.after) return [];
  const before = entry.before;
  return Object.keys(entry.after).filter(
    (field) =>
      !IGNORED_FIELDS.has(field) &&
      JSON.stringify(before[field]) !== JSON.stringify(entry.after?.[field]),
  );
};
