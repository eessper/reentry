import type { MembershipRole } from "../../types";

// FIXME: This should be exported from the ra-core package
type CanAccessParams<
  RecordType extends Record<string, any> = Record<string, any>,
> = {
  action: string;
  resource: string;
  record?: RecordType;
};

type Action = "list" | "show" | "create" | "edit" | "delete" | "export";

const ALL: readonly Action[] = [
  "list",
  "show",
  "create",
  "edit",
  "delete",
  "export",
];
const WORK_ON: readonly Action[] = ["list", "show", "edit"];

/**
 * What each role may do in the UI, per resource. It mirrors the database's
 * row-level security, which is the real guard: hiding a screen here only
 * spares people buttons that would fail.
 * - org_admin: everything, including the team (sales) and settings.
 * - clinical_lead: all service-user work, including adding and assigning.
 * - key_worker: their own service users' profiles, escalations and activity.
 * - viewer: nothing but the Control Tower's aggregates.
 */
const ACCESS: Record<
  Exclude<MembershipRole, "org_admin">,
  Partial<Record<string, readonly Action[]>>
> = {
  clinical_lead: {
    service_users: ALL,
    support_profiles: WORK_ON,
    escalations: ALL,
    activity_events: ["list", "show", "create"],
  },
  key_worker: {
    service_users: WORK_ON,
    support_profiles: WORK_ON,
    escalations: WORK_ON,
    activity_events: ["list", "show", "create"],
  },
  viewer: {},
};

export const canAccess = <
  RecordType extends Record<string, any> = Record<string, any>,
>(
  role: MembershipRole | null | undefined,
  params: CanAccessParams<RecordType>,
) => {
  if (role === "org_admin") {
    return true;
  }
  if (!role) {
    return false;
  }
  const allowed = ACCESS[role][params.resource] ?? [];
  return allowed.includes(params.action as Action);
};
