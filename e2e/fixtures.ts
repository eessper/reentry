import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54341",
  process.env.SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Tables in FK-safe deletion order (children before parents). audit_log is
// append-only and has no foreign keys, so it is left alone.
const TABLES = [
  "activity_events",
  "escalations",
  "support_profiles",
  "service_users",
  "tasks",
  "contact_notes",
  "deal_notes",
  "deals",
  "contacts",
  "companies",
  "tags",
  "favicons_excluded_domains",
  "configuration",
  "sales",
  "memberships",
  "organisations",
];

type Role = "org_admin" | "clinical_lead" | "key_worker" | "viewer";

// Every account and record belongs to an organisation. Each test gets one,
// created on first use after the reset.
let organisationId: string | undefined;

async function getOrganisationId(): Promise<string> {
  if (organisationId) return organisationId;
  const { data, error } = await adminSupabase
    .from("organisations")
    .insert({ name: "E2E organisation" })
    .select("id")
    .single();
  if (error) {
    throw new Error(`Failed to create organisation: ${error.message}`);
  }
  organisationId = data.id as string;
  return organisationId;
}

async function resetDb() {
  for (const table of TABLES) {
    // Supabase client delete need a where clause to get executed, so we use one that will match on all rows (id is not null)
    await adminSupabase.from(table).delete().not("id", "is", null);
  }

  organisationId = undefined;

  // Delete all auth users (their sales and memberships rows are deleted above)
  const { data } = await adminSupabase.auth.admin.listUsers();
  await Promise.all(
    data.users.map((user) => adminSupabase.auth.admin.deleteUser(user.id)),
  );
}

/** Creates a member of the test organisation and returns their staff profile. */
async function createSales({
  first_name,
  last_name,
  email,
  password,
  role = "key_worker",
}: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role?: Role;
}) {
  const { data: userData, error: userError } =
    await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Names live in user_metadata, like accounts invited from the app:
      // the auth sync trigger copies them onto the staff profile on sign-in.
      user_metadata: { first_name, last_name },
      app_metadata: { organisation_id: await getOrganisationId(), role },
    });

  if (userError) {
    throw new Error(`Failed to create sales: ${userError.message}`);
  }

  const { data, error } = await adminSupabase
    .from("sales")
    .update({ first_name, last_name })
    .eq("user_id", userData.user?.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create sales: ${error.message}`);
  }

  return data;
}

async function createServiceUser({
  display_name,
  reference_code,
  assigned_worker_id,
  risk_tier = "moderate",
  days_since_release = 5,
}: {
  display_name: string;
  reference_code: string;
  assigned_worker_id: number;
  risk_tier?: "low" | "moderate" | "moderate_high" | "high";
  days_since_release?: number;
}) {
  const release = new Date(Date.now() - days_since_release * 86_400_000);
  const { data, error } = await adminSupabase
    .from("service_users")
    .insert({
      organisation_id: await getOrganisationId(),
      display_name,
      reference_code,
      assigned_worker_id,
      risk_tier,
      release_date: release.toISOString().slice(0, 10),
      consent_status: "given",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create service user: ${error.message}`);
  }
  return data;
}

async function createEscalation({
  service_user_id,
  severity = "high",
  trigger_type = "keyword",
  notes,
}: {
  service_user_id: number;
  severity?: "low" | "medium" | "high" | "critical";
  trigger_type?:
    | "keyword"
    | "sentiment_dip"
    | "missed_checkins"
    | "manual"
    | "self_referral";
  notes?: string;
}) {
  const { data, error } = await adminSupabase
    .from("escalations")
    .insert({
      organisation_id: await getOrganisationId(),
      service_user_id,
      severity,
      trigger_type,
      notes,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create escalation: ${error.message}`);
  }
  return data;
}

const signIn = async (page: Page, email: string, password = "password") => {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Live Control Tower" }),
  ).toBeVisible();
};

const getMenuMethod = ({ page }: { page: Page; isMobile: boolean }) => {
  const goTo = async (name: string) => {
    await page.getByRole("link", { name, exact: true }).click();
    await page.waitForLoadState("networkidle");
  };
  return {
    goToServiceUsers: () => goTo("Service users"),
    goToEscalations: () => goTo("Escalations"),
  };
};

export const test = base.extend<{
  resetDb: void;
  createSales: typeof createSales;
  createServiceUser: typeof createServiceUser;
  createEscalation: typeof createEscalation;
  signIn: (email: string, password?: string) => Promise<void>;
  menu: ReturnType<typeof getMenuMethod>;
}>({
  resetDb: [
    // The first argument to a Playwright fixture function must use object destructuring ({}) — _ is not allowed.
    // Playwright uses this to statically analyze which fixtures are requested.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await resetDb();
      await use();
    },
    { auto: true },
  ],
  // eslint-disable-next-line no-empty-pattern
  createSales: async ({}, cb) => {
    await cb(createSales);
  },
  // eslint-disable-next-line no-empty-pattern
  createServiceUser: async ({}, cb) => {
    await cb(createServiceUser);
  },
  // eslint-disable-next-line no-empty-pattern
  createEscalation: async ({}, cb) => {
    await cb(createEscalation);
  },
  signIn: async ({ page }, cb) => {
    await cb((email, password) => signIn(page, email, password));
  },
  menu: async ({ page, isMobile }, cb) => {
    await cb(getMenuMethod({ page, isMobile }));
  },
});

export { expect };
