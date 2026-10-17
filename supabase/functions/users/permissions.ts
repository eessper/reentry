export const MEMBERSHIP_ROLES = [
  "org_admin",
  "clinical_lead",
  "key_worker",
  "viewer",
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export interface SaleIdentity {
  id: number;
  organisation_id: string;
  role: MembershipRole;
}

/**
 * Whether `target` exists from the point of view of `current`.
 *
 * The edge function reads users with the service role, which ignores
 * row-level security, so it must apply the organisation boundary itself:
 * a user in another organisation is treated as not found.
 */
export const isVisibleTo = (
  current: SaleIdentity,
  target: SaleIdentity | null | undefined,
): target is SaleIdentity =>
  target != null && target.organisation_id === current.organisation_id;

/** Org admins manage members, roles and account status. */
export const isOrgAdmin = (current: SaleIdentity): boolean =>
  current.role === "org_admin";

/**
 * Whether `current` may edit `target`'s profile: admins can edit anyone in
 * their organisation, everyone else only themselves.
 */
export const canEditProfile = (
  current: SaleIdentity,
  target: SaleIdentity,
): boolean =>
  isVisibleTo(current, target) &&
  (isOrgAdmin(current) || current.id === target.id);

/**
 * Whether `current` may change `target`'s role: only org admins, only in
 * their organisation, and never their own role, so an organisation can't be
 * left without an admin by accident.
 */
export const canChangeRole = (
  current: SaleIdentity,
  target: SaleIdentity,
): boolean =>
  isVisibleTo(current, target) &&
  isOrgAdmin(current) &&
  current.id !== target.id;

/** The role named by `value`, or undefined when it isn't a known role. */
export const parseRole = (value: unknown): MembershipRole | undefined =>
  MEMBERSHIP_ROLES.find((role) => role === value);
