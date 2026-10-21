/* eslint-disable react-refresh/only-export-components */
import { memoryStore, type AuthProvider } from "ra-core";
import { useEffect, useMemo, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import cloneDeep from "lodash/cloneDeep";
import { Notification } from "@/components/admin/notification";
import { createDataProvider } from "@/components/atomic-crm/providers/fakerest";
import { DEFAULT_USER } from "@/components/atomic-crm/providers/fakerest/authProvider";
import type { Db } from "@/components/atomic-crm/providers/fakerest/dataGenerator/types";
import type {
  Escalation,
  Sale,
  ServiceUser,
} from "@/components/atomic-crm/types";
import { CRM } from "@/components/atomic-crm/root/CRM";
import { testI18nProvider } from "@/components/atomic-crm/providers/commons/i18nProvider";

export const createTestAuthProvider = (): AuthProvider => ({
  canAccess: async () => true,
  checkAuth: async () => undefined,
  checkError: async () => undefined,
  getIdentity: async () => ({
    avatar: DEFAULT_USER.avatar.src,
    fullName: `${DEFAULT_USER.first_name} ${DEFAULT_USER.last_name}`,
    id: DEFAULT_USER.id,
  }),
  login: async () => undefined,
  logout: async () => undefined,
});

const baseSale: Sale = {
  role: "org_admin",
  avatar: DEFAULT_USER.avatar as Sale["avatar"],
  disabled: false,
  email: DEFAULT_USER.email,
  first_name: DEFAULT_USER.first_name,
  id: DEFAULT_USER.id,
  last_name: DEFAULT_USER.last_name,
  password: DEFAULT_USER.password,
  user_id: DEFAULT_USER.id.toString(),
};

// Provide a minimal FakeRest database shape so tests can override only the records
// that matter for each scenario.
export const createCrmDb = (overrides: Partial<Db> = {}): Db =>
  ({
    configuration: [{ config: {}, id: 1 }],
    sales: [baseSale],
    service_users: [],
    support_profiles: [],
    escalations: [],
    activity_events: [],
    ...overrides,
  }) as Db;

export const buildSale = (overrides: Partial<Sale> = {}): Sale => ({
  ...baseSale,
  ...overrides,
});

export const buildServiceUser = (
  overrides: Partial<ServiceUser> = {},
): ServiceUser => ({
  id: 1,
  display_name: "Ira E.",
  reference_code: "RE-43714",
  release_date: "2026-10-20",
  programme_day: 2,
  risk_tier: "moderate",
  assigned_worker_id: 0,
  consent_status: "given",
  status: "active",
  nb_open_escalations: 0,
  stability: "stable",
  last_checkin_at: null,
  created_at: "2026-10-20T09:00:00.000Z",
  updated_at: "2026-10-20T09:00:00.000Z",
  ...overrides,
});

export const buildEscalation = (
  overrides: Partial<Escalation> = {},
): Escalation => ({
  id: 1,
  service_user_id: 1,
  trigger_type: "keyword",
  severity: "high",
  status: "open",
  assigned_to: null,
  opened_at: "2026-10-20T10:00:00.000Z",
  acknowledged_at: null,
  resolved_at: null,
  notes: "Message mentioned feeling unsafe at night.",
  ...overrides,
});

export const StoryWrapper = ({
  authProvider: authProviderOverrides,
  children,
  data,
  dataProvider: dataProviderOverrides,
  initialEntries,
  silent = import.meta.env.MODE === "test",
}: {
  authProvider?: Partial<AuthProvider>;
  children: ReactNode;
  data?: Partial<Db>;
  dataProvider?: Partial<ReturnType<typeof createDataProvider>>;
  initialEntries?: string[];
  silent?: boolean;
}) => {
  const authProvider = useMemo(
    () => ({ ...createTestAuthProvider(), ...authProviderOverrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const dataProvider = useMemo(
    () => ({
      ...createDataProvider({ db: createCrmDb(cloneDeep(data)), silent }),
      ...dataProviderOverrides,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const store = useMemo(() => memoryStore(), []);

  useEffect(() => {
    // Clear localStorage on mount to prevent data pollution from previous story / test, since we persist react-query cache in localStorage.
    localStorage.clear();
  }, []);

  return (
    <MemoryRouter initialEntries={initialEntries}>
      <CRM
        authProvider={authProvider}
        dataProvider={dataProvider}
        i18nProvider={testI18nProvider}
        dashboard={() => <>{children}</>}
        store={store}
        disableTelemetry
        layout={({ children }) => (
          <>
            {children}
            <Notification />
          </>
        )}
      />
    </MemoryRouter>
  );
};
