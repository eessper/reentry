import { canAccess } from "./canAccess";

describe("canAccess", () => {
  it("lets org admins do everything, including team and settings", () => {
    expect(canAccess("org_admin", { resource: "sales", action: "edit" })).toBe(
      true,
    );
    expect(
      canAccess("org_admin", { resource: "configuration", action: "edit" }),
    ).toBe(true);
  });

  it("lets clinical leads add and assign service users but not manage the team", () => {
    expect(
      canAccess("clinical_lead", {
        resource: "service_users",
        action: "create",
      }),
    ).toBe(true);
    expect(
      canAccess("clinical_lead", { resource: "escalations", action: "delete" }),
    ).toBe(true);
    expect(
      canAccess("clinical_lead", { resource: "sales", action: "list" }),
    ).toBe(false);
    expect(
      canAccess("clinical_lead", { resource: "configuration", action: "edit" }),
    ).toBe(false);
  });

  it("lets key workers work on service users but not add or remove them", () => {
    expect(
      canAccess("key_worker", { resource: "service_users", action: "list" }),
    ).toBe(true);
    expect(
      canAccess("key_worker", { resource: "support_profiles", action: "edit" }),
    ).toBe(true);
    expect(
      canAccess("key_worker", { resource: "escalations", action: "edit" }),
    ).toBe(true);
    expect(
      canAccess("key_worker", { resource: "service_users", action: "create" }),
    ).toBe(false);
    expect(
      canAccess("key_worker", { resource: "service_users", action: "delete" }),
    ).toBe(false);
  });

  it("gives viewers no individual-record screens", () => {
    for (const resource of [
      "service_users",
      "escalations",
      "activity_events",
      "sales",
    ]) {
      expect(canAccess("viewer", { resource, action: "list" })).toBe(false);
    }
  });

  it("denies everything without a role, and unknown resources to non-admins", () => {
    expect(
      canAccess(undefined, { resource: "service_users", action: "list" }),
    ).toBe(false);
    expect(
      canAccess("clinical_lead", { resource: "contacts", action: "list" }),
    ).toBe(false);
  });
});
