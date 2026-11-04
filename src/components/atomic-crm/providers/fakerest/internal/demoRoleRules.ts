import type { DataProvider, Identifier, RaRecord } from "ra-core";

import type { MembershipRole } from "../../../types";

/**
 * The demo's stand-in for row-level security, so switching demo user shows
 * what each role really gets: key workers only reach the service users
 * assigned to them (and those people's profiles, escalations, activity,
 * notes and actions); viewers reach no individual record. The database
 * enforces the same rules for real (see supabase/schemas).
 */
const CHILD_RESOURCES = [
  "support_profiles",
  "escalations",
  "activity_events",
  "case_notes",
  "case_actions",
];

const isPersonal = (resource: string) =>
  resource === "service_users" || CHILD_RESOURCES.includes(resource);

export type DemoIdentity = { id: Identifier; role?: MembershipRole } | null;

const ALL = { page: 1, perPage: 100_000 };

export const withDemoRoleRules = <T extends DataProvider>(
  dataProvider: T,
  getIdentity: () => Promise<DemoIdentity | undefined>,
): T => {
  const assignedIds = async (salesId: Identifier) =>
    (
      await dataProvider.getList("service_users", {
        filter: { assigned_worker_id: salesId },
        pagination: ALL,
        sort: { field: "id", order: "ASC" },
      })
    ).data.map((serviceUser) => serviceUser.id);

  /** The filter to add for this resource, or null when nothing is visible. */
  const scopeFilter = async (
    resource: string,
  ): Promise<Record<string, unknown> | null> => {
    if (!isPersonal(resource)) return {};
    const identity = await getIdentity();
    if (identity?.role === "viewer") return null;
    if (identity?.role !== "key_worker") return {};
    if (resource === "service_users") {
      return { assigned_worker_id: identity.id };
    }
    return { service_user_id_eq_any: await assignedIds(identity.id) };
  };

  const isVisible = async (resource: string, record: RaRecord) => {
    const scope = await scopeFilter(resource);
    if (scope === null) return false;
    if ("assigned_worker_id" in scope) {
      return record.assigned_worker_id === scope.assigned_worker_id;
    }
    if ("service_user_id_eq_any" in scope) {
      const ids = scope.service_user_id_eq_any as Identifier[];
      return ids.includes(record.service_user_id);
    }
    return true;
  };

  const refuse = () => {
    throw new Error("You don't have access to this record");
  };

  return {
    ...dataProvider,
    async getList(resource, params) {
      const scope = await scopeFilter(resource);
      if (scope === null) return { data: [], total: 0 };
      return dataProvider.getList(resource, {
        ...params,
        filter: { ...params.filter, ...scope },
      });
    },
    async getManyReference(resource, params) {
      const scope = await scopeFilter(resource);
      if (scope === null) return { data: [], total: 0 };
      return dataProvider.getManyReference(resource, {
        ...params,
        filter: { ...params.filter, ...scope },
      });
    },
    async getMany(resource, params) {
      const result = await dataProvider.getMany(resource, params);
      const visible = await Promise.all(
        result.data.map((record) => isVisible(resource, record)),
      );
      return {
        ...result,
        data: result.data.filter((_, index) => visible[index]),
      };
    },
    async getOne(resource, params) {
      const result = await dataProvider.getOne(resource, params);
      if (!(await isVisible(resource, result.data))) refuse();
      return result;
    },
    async create(resource, params) {
      if (!(await isVisible(resource, params.data as RaRecord))) refuse();
      return dataProvider.create(resource, params);
    },
    async update(resource, params) {
      const { data } = await dataProvider.getOne(resource, { id: params.id });
      if (!(await isVisible(resource, data))) refuse();
      return dataProvider.update(resource, params);
    },
    async delete(resource, params) {
      const { data } = await dataProvider.getOne(resource, { id: params.id });
      if (!(await isVisible(resource, data))) refuse();
      return dataProvider.delete(resource, params);
    },
  };
};
