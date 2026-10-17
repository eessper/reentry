// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  canChangeRole,
  canEditProfile,
  isOrgAdmin,
  isVisibleTo,
  parseRole,
  type SaleIdentity,
} from "./permissions";

const ALPHA = "a0000000-0000-0000-0000-000000000000";
const BRAVO = "b0000000-0000-0000-0000-000000000000";

const alphaAdmin: SaleIdentity = {
  id: 1,
  organisation_id: ALPHA,
  role: "org_admin",
};
const alphaWorker: SaleIdentity = {
  id: 2,
  organisation_id: ALPHA,
  role: "key_worker",
};
const alphaColleague: SaleIdentity = {
  id: 3,
  organisation_id: ALPHA,
  role: "key_worker",
};
const alphaLead: SaleIdentity = {
  id: 5,
  organisation_id: ALPHA,
  role: "clinical_lead",
};
const bravoUser: SaleIdentity = {
  id: 4,
  organisation_id: BRAVO,
  role: "key_worker",
};

describe("isVisibleTo", () => {
  it("hides a user in another organisation, even from an admin", () => {
    expect(isVisibleTo(alphaAdmin, bravoUser)).toBe(false);
  });

  it("treats a missing user as not visible", () => {
    expect(isVisibleTo(alphaAdmin, null)).toBe(false);
    expect(isVisibleTo(alphaAdmin, undefined)).toBe(false);
  });

  it("shows a user in the same organisation", () => {
    expect(isVisibleTo(alphaWorker, alphaColleague)).toBe(true);
  });
});

describe("isOrgAdmin", () => {
  it("is true only for the org_admin role", () => {
    expect(isOrgAdmin(alphaAdmin)).toBe(true);
    expect(isOrgAdmin(alphaLead)).toBe(false);
    expect(isOrgAdmin(alphaWorker)).toBe(false);
  });
});

describe("canEditProfile", () => {
  it("refuses an admin editing a user in another organisation", () => {
    expect(canEditProfile(alphaAdmin, bravoUser)).toBe(false);
  });

  it("lets an admin edit anyone in their own organisation", () => {
    expect(canEditProfile(alphaAdmin, alphaWorker)).toBe(true);
  });

  it("lets a non-admin edit only their own profile", () => {
    expect(canEditProfile(alphaWorker, alphaWorker)).toBe(true);
    expect(canEditProfile(alphaWorker, alphaColleague)).toBe(false);
  });

  it("does not let a clinical lead edit other staff profiles", () => {
    expect(canEditProfile(alphaLead, alphaWorker)).toBe(false);
  });
});

describe("canChangeRole", () => {
  it("lets an admin change the role of someone in their organisation", () => {
    expect(canChangeRole(alphaAdmin, alphaWorker)).toBe(true);
  });

  it("refuses an admin changing their own role", () => {
    expect(canChangeRole(alphaAdmin, alphaAdmin)).toBe(false);
  });

  it("refuses an admin changing a role in another organisation", () => {
    expect(canChangeRole(alphaAdmin, bravoUser)).toBe(false);
  });

  it("refuses everyone who is not an org admin", () => {
    expect(canChangeRole(alphaLead, alphaWorker)).toBe(false);
    expect(canChangeRole(alphaWorker, alphaWorker)).toBe(false);
  });
});

describe("parseRole", () => {
  it("accepts every membership role", () => {
    for (const role of ["org_admin", "clinical_lead", "key_worker", "viewer"]) {
      expect(parseRole(role)).toBe(role);
    }
  });

  it("rejects anything else", () => {
    expect(parseRole("admin")).toBeUndefined();
    expect(parseRole(true)).toBeUndefined();
    expect(parseRole(undefined)).toBeUndefined();
  });
});
