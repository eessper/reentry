import fakeRestDataProvider from "ra-data-fakerest";

import { type DemoIdentity, withDemoRoleRules } from "./demoRoleRules";

const buildProvider = (identity: DemoIdentity) =>
  withDemoRoleRules(
    fakeRestDataProvider(
      {
        service_users: [
          { id: 1, assigned_worker_id: 2 },
          { id: 2, assigned_worker_id: 3 },
        ],
        escalations: [
          { id: 10, service_user_id: 1 },
          { id: 20, service_user_id: 2 },
        ],
        sales: [{ id: 2 }, { id: 3 }],
      },
      false,
    ),
    async () => identity,
  );

const listIds = async (
  provider: ReturnType<typeof buildProvider>,
  resource: string,
) =>
  (
    await provider.getList(resource, {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    })
  ).data.map((record) => record.id);

describe("withDemoRoleRules", () => {
  it("shows a key worker only their service users and those people's records", async () => {
    const provider = buildProvider({ id: 2, role: "key_worker" });

    expect(await listIds(provider, "service_users")).toEqual([1]);
    expect(await listIds(provider, "escalations")).toEqual([10]);
  });

  it("refuses a key worker someone else's record, to read or to change", async () => {
    const provider = buildProvider({ id: 2, role: "key_worker" });

    await expect(provider.getOne("service_users", { id: 2 })).rejects.toThrow();
    await expect(
      provider.create("escalations", { data: { service_user_id: 2 } }),
    ).rejects.toThrow();
    await expect(
      provider.update("escalations", {
        id: 20,
        data: { status: "resolved" },
        previousData: { id: 20 },
      }),
    ).rejects.toThrow();
  });

  it("shows a viewer no individual records, but still the staff list", async () => {
    const provider = buildProvider({ id: 3, role: "viewer" });

    expect(await listIds(provider, "service_users")).toEqual([]);
    expect(await listIds(provider, "escalations")).toEqual([]);
    expect(await listIds(provider, "sales")).toEqual([2, 3]);
  });

  it("shows leads and admins everything", async () => {
    const provider = buildProvider({ id: 0, role: "clinical_lead" });

    expect(await listIds(provider, "service_users")).toEqual([1, 2]);
    expect(await listIds(provider, "escalations")).toEqual([10, 20]);
  });
});
