import { supabaseDataProvider } from "ra-supabase-core";
import {
  withLifecycleCallbacks,
  type DataProvider,
  type GetListParams,
  type Identifier,
  type RaRecord,
  type ResourceCallbacks,
} from "ra-core";
import type {
  AuditTrailEntry,
  ControlTowerStats,
  RAFile,
  Sale,
  SalesFormData,
  SignUpData,
} from "../../types";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { signFiles, signUrl, uploadToBucket } from "./attachmentStorage";
import { getIsInitialized } from "./authProvider";
import { getSupabaseClient } from "./supabase";

const getBaseDataProvider = () =>
  supabaseDataProvider({
    instanceUrl: import.meta.env.VITE_SUPABASE_URL,
    apiKey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
    supabaseClient: getSupabaseClient(),
    sortOrder: "asc,desc.nullslast" as any,
  });

const getDataProviderWithCustomMethods = () => {
  const baseDataProvider = getBaseDataProvider();

  return {
    ...baseDataProvider,
    async getList(resource: string, params: GetListParams) {
      if (resource === "sales") {
        return baseDataProvider.getList("sales_summary", params);
      }
      if (resource === "service_users") {
        return baseDataProvider.getList("service_users_summary", params);
      }

      return baseDataProvider.getList(resource, params);
    },
    async getOne(resource: string, params: any) {
      if (resource === "sales") {
        return baseDataProvider.getOne("sales_summary", params);
      }
      if (resource === "service_users") {
        return baseDataProvider.getOne("service_users_summary", params);
      }

      return baseDataProvider.getOne(resource, params);
    },

    async signUp({ email, password, first_name, last_name }: SignUpData) {
      const response = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name,
            last_name,
          },
        },
      });

      if (!response.data?.user || response.error) {
        console.error("signUp.error", response.error);
        throw new Error(response?.error?.message || "Failed to create account");
      }

      // Update the is initialized cache
      (getIsInitialized as any)._is_initialized_cache = true;

      return {
        id: response.data.user.id,
        email,
        password,
      };
    },
    async salesCreate(body: SalesFormData) {
      const { data, error } = await getSupabaseClient().functions.invoke<{
        data: Sale;
      }>("users", {
        method: "POST",
        body,
      });

      if (!data || error) {
        console.error("salesCreate.error", error);
        const errorDetails = await (async () => {
          try {
            return (await error?.context?.json()) ?? {};
          } catch {
            return {};
          }
        })();
        throw Object.assign(
          new Error(errorDetails?.message || "Failed to create the user"),
          { code: errorDetails?.code, email: errorDetails?.email },
        );
      }

      return data.data;
    },
    async salesUpdate(
      id: Identifier,
      data: Partial<Omit<SalesFormData, "password">>,
    ) {
      const {
        email,
        secondary_emails,
        first_name,
        last_name,
        role,
        avatar,
        disabled,
      } = data;

      const { data: updatedData, error } =
        await getSupabaseClient().functions.invoke<{
          data: Sale;
        }>("users", {
          method: "PATCH",
          body: {
            sales_id: id,
            email,
            secondary_emails,
            first_name,
            last_name,
            role,
            disabled,
            avatar,
          },
        });

      if (!updatedData || error) {
        console.error("salesUpdate.error", error);
        const errorDetails = await (async () => {
          try {
            return (await error?.context?.json()) ?? {};
          } catch {
            return {};
          }
        })();
        throw Object.assign(
          new Error(
            errorDetails?.message || "Failed to update account manager",
          ),
          { code: errorDetails?.code, email: errorDetails?.email },
        );
      }

      return updatedData.data;
    },
    async updatePassword(id: Identifier) {
      const { data: passwordUpdated, error } =
        await getSupabaseClient().functions.invoke<boolean>("update_password", {
          method: "PATCH",
          body: {
            sales_id: id,
          },
        });

      if (!passwordUpdated || error) {
        console.error("update_password.error", error);
        throw new Error("Failed to update password");
      }

      return passwordUpdated;
    },
    async isInitialized() {
      return getIsInitialized();
    },
    async getControlTowerStats(): Promise<ControlTowerStats> {
      const { data, error } = await getSupabaseClient().rpc(
        "control_tower_stats",
      );
      if (error) {
        console.error("control_tower_stats.error", error);
        throw new Error("Failed to load the Control Tower figures");
      }
      return data as ControlTowerStats;
    },
    async getServiceUserHistory(
      serviceUserId: Identifier,
    ): Promise<AuditTrailEntry[]> {
      const { data, error } = await getSupabaseClient().rpc(
        "service_user_history",
        { service_user_id: serviceUserId },
      );
      if (error) {
        console.error("service_user_history.error", error);
        throw new Error("Failed to load the audit trail");
      }
      return data ?? [];
    },
    async logRecordView(tableName: LoggedRecordTable, recordId: Identifier) {
      const { error } = await getSupabaseClient().rpc("log_record_view", {
        table_name: tableName,
        record_id: recordId,
      });
      if (error) {
        console.error("log_record_view.error", error);
        throw new Error("Failed to log the record view");
      }
    },
    async getConfiguration(): Promise<ConfigurationContextValue> {
      const { data } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      return signConfigLogos((data?.config as ConfigurationContextValue) ?? {});
    },
    async updateConfiguration(
      config: ConfigurationContextValue,
    ): Promise<ConfigurationContextValue> {
      const { data } = await baseDataProvider.update("configuration", {
        id: 1,
        data: { config },
        previousData: { id: 1 },
      });
      return signConfigLogos(data.config as ConfigurationContextValue);
    },
  } satisfies DataProvider;
};

/** Tables whose record views go into the audit log (see log_record_view). */
export type LoggedRecordTable = "service_users" | "support_profiles";

export type CrmDataProvider = ReturnType<
  typeof getDataProviderWithCustomMethods
>;

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    return (await uploadToBucket(logo, "shared")).src;
  }
  return logo?.src ?? "";
};

// Stored organisation logos are storage URLs whose signature expires, so
// they are re-signed every time the configuration is read.
const signConfigLogos = async (
  config: ConfigurationContextValue,
): Promise<ConfigurationContextValue> => ({
  ...config,
  ...(config.lightModeLogo && {
    lightModeLogo: (await signUrl(config.lightModeLogo)) ?? "",
  }),
  ...(config.darkModeLogo && {
    darkModeLogo: (await signUrl(config.darkModeLogo)) ?? "",
  }),
});

/**
 * Read callbacks that replace the stored URLs of a resource's files with
 * fresh signed URLs, signing a whole page of records in one request.
 */
const signedReads = <R extends RaRecord>(
  getFiles: (record: R) => RAFile[],
  setFiles: (record: R, files: RAFile[]) => R,
): Pick<
  ResourceCallbacks<R>,
  "afterGetList" | "afterGetMany" | "afterGetManyReference" | "afterGetOne"
> => {
  const signRecords = (records: R[]) =>
    signRecordFiles(records, getFiles, setFiles);
  return {
    afterGetList: async (result) => ({
      ...result,
      data: await signRecords(result.data),
    }),
    afterGetMany: async (result) => ({
      ...result,
      data: await signRecords(result.data),
    }),
    afterGetManyReference: async (result) => ({
      ...result,
      data: await signRecords(result.data),
    }),
    afterGetOne: async (result) => ({
      ...result,
      data: (await signRecords([result.data]))[0],
    }),
  };
};

const signRecordFiles = async <R>(
  records: R[],
  getFiles: (record: R) => RAFile[],
  setFiles: (record: R, files: RAFile[]) => R,
): Promise<R[]> => {
  const filesPerRecord = records.map(getFiles);
  const signed = await signFiles(filesPerRecord.flat());
  let offset = 0;
  return records.map((record, index) => {
    const count = filesPerRecord[index].length;
    const files = signed.slice(offset, offset + count);
    offset += count;
    return count ? setFiles(record, files) : record;
  });
};

const lifeCycleCallbacks: ResourceCallbacks[] = [
  {
    resource: "configuration",
    beforeUpdate: async (params) => {
      const config = params.data.config;
      if (config) {
        config.lightModeLogo = await processConfigLogo(config.lightModeLogo);
        config.darkModeLogo = await processConfigLogo(config.darkModeLogo);
      }
      return params;
    },
  },
  {
    resource: "sales",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["first_name", "last_name"])(params);
    },
    beforeSave: async (data: Sale, _, __) => {
      if (data.avatar) {
        data.avatar = await uploadToBucket(data.avatar, "shared");
      }
      return data;
    },
    ...signedReads<Sale>(
      (sale) => (sale.avatar ? [sale.avatar] : []),
      (sale, [avatar]) => ({ ...sale, avatar }),
    ),
  },
  {
    resource: "service_users",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["display_name", "reference_code"])(params);
    },
  },
];

export const getDataProvider = () => {
  if (import.meta.env.VITE_SUPABASE_URL === undefined) {
    throw new Error("Please set the VITE_SUPABASE_URL environment variable");
  }
  if (import.meta.env.VITE_SB_PUBLISHABLE_KEY === undefined) {
    throw new Error(
      "Please set the VITE_SB_PUBLISHABLE_KEY environment variable",
    );
  }
  return withLifecycleCallbacks(
    getDataProviderWithCustomMethods(),
    lifeCycleCallbacks,
  ) as CrmDataProvider;
};

const applyFullTextSearch = (columns: string[]) => (params: GetListParams) => {
  if (!params.filter?.q) {
    return params;
  }
  const { q, ...filter } = params.filter;
  return {
    ...params,
    filter: {
      ...filter,
      "@or": columns.reduce((acc, column) => {
        if (column === "email")
          return {
            ...acc,
            [`email_fts@ilike`]: q,
          };
        if (column === "phone")
          return {
            ...acc,
            [`phone_fts@ilike`]: q,
          };
        else
          return {
            ...acc,
            [`${column}@ilike`]: q,
          };
      }, {}),
    },
  };
};
