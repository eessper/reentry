import {
  changedFields,
  pickConfiguration,
  pickEditableFields,
  validateReferenceCode,
} from "./serviceUserFields";
import type { AuditTrailEntry } from "../types";

const entry = (overrides: Partial<AuditTrailEntry>): AuditTrailEntry => ({
  id: 1,
  created_at: "2026-10-21T10:00:00Z",
  action: "update",
  table_name: "support_profiles",
  record_id: "1",
  actor_name: "Kim Test",
  before: null,
  after: null,
  ...overrides,
});

describe("changedFields", () => {
  it("lists the fields an update changed, ignoring version bookkeeping", () => {
    expect(
      changedFields(
        entry({
          before: {
            keyword_sensitivity: 5,
            active_cbt_module: null,
            version: 1,
            updated_at: "a",
          },
          after: {
            keyword_sensitivity: 8,
            active_cbt_module: null,
            version: 2,
            updated_at: "b",
          },
        }),
      ),
    ).toEqual(["keyword_sensitivity"]);
  });

  it("lists nothing for creates and views", () => {
    expect(changedFields(entry({ action: "create", after: { a: 1 } }))).toEqual(
      [],
    );
    expect(changedFields(entry({ action: "view" }))).toEqual([]);
  });
});

describe("pickEditableFields", () => {
  const values = {
    risk_tier: "high" as const,
    status: "active" as const,
    consent_status: "given" as const,
    assigned_worker_id: 7,
    programme_day: 12,
    stability: "watch" as const,
  };

  it("never sends the summary view's derived fields", () => {
    expect(pickEditableFields(values, true)).toEqual({
      risk_tier: "high",
      status: "active",
      consent_status: "given",
      assigned_worker_id: 7,
    });
  });

  it("leaves the key worker out when the user can't reassign", () => {
    expect(pickEditableFields(values, false)).not.toHaveProperty(
      "assigned_worker_id",
    );
  });
});

describe("pickConfiguration", () => {
  it("sends only the configuration, not the version or who changed it", () => {
    expect(
      Object.keys(
        pickConfiguration({
          keyword_sensitivity: 4,
          version: 3,
          updated_by: 1,
        }),
      ),
    ).not.toContain("version");
  });
});

describe("validateReferenceCode", () => {
  it("accepts RE-12345 and rejects anything else", () => {
    expect(validateReferenceCode("RE-12345")).toBeUndefined();
    expect(validateReferenceCode("RE-123")).toBe(
      "resources.service_users.validation.reference_code",
    );
  });
});
