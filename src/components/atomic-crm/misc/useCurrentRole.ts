import { useGetIdentity } from "ra-core";

import type { MembershipRole } from "../types";

/** The signed-in member's role, or undefined while it loads. */
export const useCurrentRole = (): MembershipRole | undefined => {
  const { identity } = useGetIdentity();
  return identity?.role as MembershipRole | undefined;
};

/** Org admins and clinical leads work with every record in the organisation. */
export const seesAllRecords = (role: MembershipRole | undefined) =>
  role === "org_admin" || role === "clinical_lead";
