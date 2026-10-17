// @vitest-environment node
import { describe, it, expect } from "vitest";
import { canEditProfile, isVisibleTo } from "./permissions";

const ALPHA = "a0000000-0000-0000-0000-000000000000";
const BRAVO = "b0000000-0000-0000-0000-000000000000";

const alphaAdmin = { id: 1, organisation_id: ALPHA, administrator: true };
const alphaWorker = { id: 2, organisation_id: ALPHA, administrator: false };
const alphaColleague = { id: 3, organisation_id: ALPHA, administrator: false };
const bravoUser = { id: 4, organisation_id: BRAVO, administrator: false };

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
});
