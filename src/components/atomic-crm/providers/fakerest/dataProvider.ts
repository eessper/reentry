import {
  withLifecycleCallbacks,
  type Identifier,
  type RaRecord,
} from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";

import type {
  ActivityEvent,
  ControlTowerStats,
  Escalation,
  Sale,
  SalesFormData,
  ServiceUser,
  SignUpData,
} from "../../types";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import type { CrmDataProvider } from "../types";
import {
  authProvider as defaultAuthProvider,
  USER_STORAGE_KEY,
} from "./authProvider";
import generateData from "./dataGenerator";
import type { Db } from "./dataGenerator/types";
import { AUDITED_RESOURCES, createDemoAuditLog } from "./internal/demoAuditLog";
import { type DemoIdentity, withDemoRoleRules } from "./internal/demoRoleRules";
import { withDerivedFields } from "./internal/demoStability";
import { withSupabaseFilterAdapter } from "./internal/supabaseAdapter";

export interface CreateFakeRestDataProviderOptions {
  db?: Db;
  latency?: number;
  authProvider?: Pick<typeof defaultAuthProvider, "getIdentity">;
  silent?: boolean;
}

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    return (await convertFileToBase64(logo)) as string;
  }
  return logo?.src ?? "";
};

/**
 * The in-browser demo data provider (`make start-demo`). It mirrors the
 * Supabase provider's custom methods, and imitates what the database does:
 * role rules (withDemoRoleRules), the audit log (an in-memory copy) and the
 * summary view's derived fields (demoStability).
 */
export const createDataProvider = ({
  db = generateData(),
  latency = 300,
  authProvider,
  silent = false,
}: CreateFakeRestDataProviderOptions = {}): CrmDataProvider => {
  const getIdentity = async () =>
    authProvider?.getIdentity?.() ?? defaultAuthProvider.getIdentity?.();
  const rawDataProvider = fakeRestDataProvider(db, !silent, latency);
  const baseDataProvider = withDemoRoleRules(
    rawDataProvider,
    getIdentity as () => Promise<DemoIdentity>,
  );

  const auditLog = createDemoAuditLog();
  const actorName = async () => (await getIdentity())?.fullName ?? "System";

  const getAll = <T extends { id: Identifier }>(
    resource: string,
    provider = baseDataProvider,
  ) =>
    provider.getList<T>(resource, {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    });

  const deriveServiceUsers = async <T extends RaRecord>(records: T[]) => {
    const [escalations, events] = await Promise.all([
      getAll<Escalation>("escalations", rawDataProvider),
      getAll<ActivityEvent>("activity_events", rawDataProvider),
    ]);
    return records.map(
      (record) =>
        withDerivedFields(
          record as unknown as ServiceUser,
          escalations.data,
          events.data,
        ) as unknown as T,
    );
  };

  const dataProviderWithCustomMethod: CrmDataProvider = {
    ...baseDataProvider,
    // Changes to people's records go in the demo audit log, like the triggers do
    create: async (resource, params) => {
      const result = await baseDataProvider.create(resource, params);
      if (AUDITED_RESOURCES.includes(resource)) {
        auditLog.record({
          action: "create",
          tableName: resource,
          recordId: result.data.id,
          actorName: await actorName(),
          after: result.data,
        });
      }
      return result;
    },
    update: async (resource, params) => {
      const before = AUDITED_RESOURCES.includes(resource)
        ? (await rawDataProvider.getOne(resource, { id: params.id })).data
        : null;
      const result = await baseDataProvider.update(resource, params);
      if (before) {
        auditLog.record({
          action: "update",
          tableName: resource,
          recordId: params.id,
          actorName: await actorName(),
          before,
          after: result.data,
        });
      }
      return result;
    },
    delete: async (resource, params) => {
      const result = await baseDataProvider.delete(resource, params);
      if (AUDITED_RESOURCES.includes(resource)) {
        auditLog.record({
          action: "delete",
          tableName: resource,
          recordId: params.id,
          actorName: await actorName(),
          before: result.data,
        });
      }
      return result;
    },
    signUp: async ({
      email,
      password,
      first_name,
      last_name,
    }: SignUpData): Promise<{
      id: string;
      email: string;
      password: string;
    }> => {
      const user = await baseDataProvider.create("sales", {
        data: {
          email,
          first_name,
          last_name,
        },
      });

      return {
        ...user.data,
        password,
      };
    },
    salesCreate: async ({ ...data }: SalesFormData): Promise<Sale> => {
      const response = await dataProvider.create("sales", {
        data: {
          ...data,
          password: "new_password",
        },
      });

      return response.data;
    },
    salesUpdate: async (
      id: Identifier,
      data: Partial<Omit<SalesFormData, "password">>,
    ): Promise<Sale> => {
      const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
        id,
      });

      if (!previousData) {
        throw new Error("User not found");
      }

      const { data: sale } = await dataProvider.update<Sale>("sales", {
        id,
        data,
        previousData,
      });
      return { ...sale, user_id: sale.id.toString() };
    },
    isInitialized: async (): Promise<boolean> => {
      const sales = await dataProvider.getList<Sale>("sales", {
        filter: {},
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
      });
      return sales.data.length > 0;
    },
    updatePassword: async (id: Identifier): Promise<true> => {
      const currentUser = await getIdentity();
      if (!currentUser) {
        throw new Error("User not found");
      }
      const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
        id: currentUser.id,
      });

      if (!previousData) {
        throw new Error("User not found");
      }

      await dataProvider.update("sales", {
        id,
        data: {
          password: "demo_newPassword",
        },
        previousData,
      });

      return true;
    },
    logRecordView: async (tableName, recordId) => {
      const { data } = await baseDataProvider.getOne(tableName, {
        id: recordId,
      });
      auditLog.record({
        action: "view",
        tableName,
        recordId,
        actorName: await actorName(),
        serviceUserId:
          tableName === "service_users" ? recordId : data.service_user_id,
      });
    },
    getServiceUserHistory: async (serviceUserId) => {
      // Throws, like the database, when the caller can't see this person
      await baseDataProvider.getOne("service_users", { id: serviceUserId });
      return auditLog.historyFor(serviceUserId);
    },
    // Aggregates: key workers get their caseload, everyone else (viewers
    // included) the whole organisation, as control_tower_stats() does.
    getControlTowerStats: async () => {
      const identity = await getIdentity();
      const isCaseload = identity?.role === "key_worker";
      const provider = isCaseload ? baseDataProvider : rawDataProvider;
      const serviceUsers = await getAll<ServiceUser>("service_users", provider);
      return computeDemoStats(
        isCaseload ? "caseload" : "organisation",
        { data: await deriveServiceUsers(serviceUsers.data) },
        await getAll<Escalation>("escalations", provider),
        await getAll<ActivityEvent>("activity_events", provider),
      );
    },
    getConfiguration: async (): Promise<ConfigurationContextValue> => {
      const { data } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      return (data?.config as ConfigurationContextValue) ?? {};
    },
    updateConfiguration: async (
      config: ConfigurationContextValue,
    ): Promise<ConfigurationContextValue> => {
      const { data: prev } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      await baseDataProvider.update("configuration", {
        id: 1,
        data: { config },
        previousData: prev,
      });
      return config;
    },
  };

  const dataProvider = withLifecycleCallbacks(
    withSupabaseFilterAdapter(dataProviderWithCustomMethod),
    [
      {
        resource: "configuration",
        beforeUpdate: async (params) => {
          const config = params.data.config;
          if (config) {
            config.lightModeLogo = await processConfigLogo(
              config.lightModeLogo,
            );
            config.darkModeLogo = await processConfigLogo(config.darkModeLogo);
          }
          return params;
        },
      },
      // The summary view's derived fields (status dot, open escalations)
      {
        resource: "service_users",
        afterGetList: async (result) => ({
          ...result,
          data: await deriveServiceUsers(result.data),
        }),
        afterGetMany: async (result) => ({
          ...result,
          data: await deriveServiceUsers(result.data),
        }),
        afterGetOne: async (result) => ({
          ...result,
          data: (await deriveServiceUsers([result.data]))[0],
        }),
      },
      // Mirror the database defaults and triggers that stamp who did what, and when
      {
        resource: "escalations",
        beforeCreate: async (params) => ({
          ...params,
          data: {
            status: "open",
            assigned_to: null,
            acknowledged_at: null,
            resolved_at: null,
            ...params.data,
            opened_at: new Date().toISOString(),
          },
        }),
      },
      {
        resource: "activity_events",
        beforeCreate: async (params) => ({
          ...params,
          data: {
            ...params.data,
            actor_sales_id: (await getIdentity())?.id ?? null,
            created_at: new Date().toISOString(),
          },
        }),
      },
      {
        resource: "case_notes",
        beforeCreate: async (params) => {
          const now = new Date().toISOString();
          return {
            ...params,
            data: {
              ...params.data,
              author_sales_id: (await getIdentity())?.id ?? null,
              created_at: now,
              updated_at: now,
            },
          };
        },
      },
      {
        resource: "case_actions",
        beforeCreate: async (params) => ({
          ...params,
          data: {
            ...params.data,
            created_by: (await getIdentity())?.id ?? null,
            created_at: new Date().toISOString(),
          },
        }),
      },
      {
        resource: "sales",
        beforeCreate: async (params) => {
          const { data } = params;
          // New staff are key workers unless a role is given
          if (data.role == null) {
            data.role = "key_worker";
          }
          return params;
        },
        afterSave: async (data) => {
          // Since the current user is stored in localStorage in fakerest authProvider
          // we need to update it to keep information up to date in the UI
          const currentUser = await getIdentity();
          if (currentUser?.id === data.id) {
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
          }
          return data;
        },
      },
    ],
  ) as CrmDataProvider;

  return dataProvider;
};

export const dataProvider = createDataProvider();

/**
 * Convert a `File` object returned by the upload input into a base 64 string.
 * That's not the most optimized way to store images in production, but it's
 * enough to illustrate the idea of dataprovider decoration.
 */
const convertFileToBase64 = (file: { rawFile: Blob }): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    // We know result is a string as we used readAsDataURL
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file.rawFile);
  });

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// The demo has no history to replay, so every day of the chart shows the
// current status dots. Adherence counts the last week's check-ins.
const computeDemoStats = (
  scope: ControlTowerStats["scope"],
  serviceUsers: { data: ServiceUser[] },
  escalations: { data: Escalation[] },
  events: { data: ActivityEvent[] },
): ControlTowerStats => {
  const active = serviceUsers.data.filter((user) => user.status !== "exited");
  const open = escalations.data.filter(
    (escalation) => escalation.status !== "resolved",
  );
  const count = (stability: ServiceUser["stability"]) =>
    active.filter((user) => user.stability === stability).length;
  const lastWeek = events.data.filter(
    (event) => Date.now() - new Date(event.created_at).getTime() <= WEEK_MS,
  );
  const completed = lastWeek.filter((event) => event.type === "checkin").length;
  const missed = lastWeek.filter(
    (event) => event.type === "missed_checkin",
  ).length;
  return {
    scope,
    active_clients: active.length,
    checkins_completed: completed,
    checkins_missed: missed,
    checkin_adherence:
      completed + missed === 0
        ? null
        : Math.round((100 * completed) / (completed + missed)),
    open_escalations: open.length,
    urgent_escalations: open.filter(
      (escalation) =>
        escalation.severity === "high" || escalation.severity === "critical",
    ).length,
    stability: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000);
      return {
        day: day.toISOString().slice(0, 10),
        stable: count("stable"),
        watch: count("watch"),
        critical: count("critical"),
      };
    }),
  };
};
