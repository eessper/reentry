import type { Identifier, RaRecord } from "ra-core";

import type { AuditTrailEntry } from "../../../types";

/** Tables whose changes the real audit_log records (09_audit.sql). */
export const AUDITED_RESOURCES = [
  "service_users",
  "support_profiles",
  "escalations",
  "activity_events",
  "case_notes",
  "case_actions",
];

type Change = {
  action: AuditTrailEntry["action"];
  tableName: string;
  recordId: Identifier;
  actorName: string;
  before?: RaRecord | null;
  after?: RaRecord | null;
  /** For views of a support profile, which has no service_user_id in the entry. */
  serviceUserId?: Identifier;
};

/**
 * An in-memory audit log for the demo, so the profile's audit trail shows
 * what happens during a demo. It resets on reload; the real one is an
 * append-only table written by database triggers.
 */
export const createDemoAuditLog = () => {
  const entries: Array<AuditTrailEntry & { service_user_id: string }> = [];

  const record = (change: Change) => {
    const row = change.after ?? change.before;
    const serviceUserId =
      change.serviceUserId ??
      (change.tableName === "service_users"
        ? change.recordId
        : row?.service_user_id);
    entries.push({
      id: entries.length + 1,
      created_at: new Date().toISOString(),
      action: change.action,
      table_name: change.tableName,
      record_id: String(change.recordId),
      actor_name: change.actorName,
      before: (change.before as Record<string, unknown>) ?? null,
      after: (change.after as Record<string, unknown>) ?? null,
      service_user_id: String(serviceUserId),
    });
  };

  const historyFor = (serviceUserId: Identifier): AuditTrailEntry[] =>
    entries
      .filter((entry) => entry.service_user_id === String(serviceUserId))
      .reverse()
      .map(({ service_user_id: _, ...entry }) => entry);

  return { record, historyFor };
};
