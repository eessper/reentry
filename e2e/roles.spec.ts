import { expect, test } from "./fixtures";

test.describe("what each role sees", () => {
  test.beforeEach(async ({ createSales, createServiceUser }) => {
    const kim = await createSales({
      email: "kim@example.test",
      first_name: "Kim",
      last_name: "Worker",
      password: "password",
    });
    const ken = await createSales({
      email: "ken@example.test",
      first_name: "Ken",
      last_name: "Worker",
      password: "password",
    });
    await createSales({
      email: "vera@example.test",
      first_name: "Vera",
      last_name: "Viewer",
      password: "password",
      role: "viewer",
    });
    await createServiceUser({
      display_name: "Ari U.",
      reference_code: "RE-10001",
      assigned_worker_id: kim.id,
    });
    await createServiceUser({
      display_name: "Bex L.",
      reference_code: "RE-10002",
      assigned_worker_id: ken.id,
    });
  });

  test("a key worker sees only the people assigned to them", async ({
    page,
    signIn,
    menu,
  }) => {
    await signIn("kim@example.test");
    await expect(page.getByText("Your caseload")).toBeVisible();
    await expect(page.getByText("Ari U.").first()).toBeVisible();
    await expect(page.getByText("Bex L.")).toBeHidden();

    await menu.goToServiceUsers();
    await expect(page.getByText("RE-10001")).toBeVisible();
    await expect(page.getByText("RE-10002")).toBeHidden();
  });

  test("a viewer gets aggregate figures and no individual records", async ({
    page,
    signIn,
  }) => {
    await signIn("vera@example.test");

    await expect(page.getByText("Individual records are hidden")).toBeVisible();
    await expect(page.getByText("Whole organisation")).toBeVisible();
    await expect(page.getByText("Ari U.")).toBeHidden();
    await expect(page.getByText("Bex L.")).toBeHidden();
    await expect(
      page.getByRole("link", { name: "Service users", exact: true }),
    ).toBeHidden();
    await expect(
      page.getByRole("link", { name: "Escalations", exact: true }),
    ).toBeHidden();
  });
});
