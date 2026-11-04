export interface SaleIdentity {
  id: number;
  organisation_id: string;
  administrator: boolean;
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

/**
 * Whether `current` may edit `target`'s profile: admins can edit anyone in
 * their organisation, everyone else only themselves.
 */
export const canEditProfile = (
  current: SaleIdentity,
  target: SaleIdentity,
): boolean =>
  isVisibleTo(current, target) &&
  (current.administrator || current.id === target.id);
