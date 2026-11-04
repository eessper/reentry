import { expect, test } from "./fixtures";

test("a key worker configures a profile and sees it in the audit trail", async ({
  page,
  createSales,
  createServiceUser,
  signIn,
  menu,
}) => {
  const kim = await createSales({
    email: "kim@example.test",
    first_name: "Kim",
    last_name: "Worker",
    password: "password",
  });
  await createServiceUser({
    display_name: "Ari U.",
    reference_code: "RE-10001",
    assigned_worker_id: kim.id,
  });

  await signIn("kim@example.test");
  await menu.goToServiceUsers();
  await page.getByText("Ari U.").first().click();

  await expect(
    page.getByRole("heading", { name: "Clinical profile configuration" }),
  ).toBeVisible();
  await expect(page.getByText("Version 1")).toBeVisible();
  // Opening the record is itself logged
  await expect(page.getByText("Record opened")).toBeVisible();

  await page.getByRole("combobox", { name: "Active CBT module" }).click();
  await page.getByRole("option", { name: "Urge surfing" }).click();
  await page.getByRole("button", { name: "Save" }).first().click();

  await expect(page.getByText("Profile saved")).toBeVisible();
  await expect(page.getByText("Version 2")).toBeVisible();
  await expect(page.getByText("Profile changed")).toBeVisible();
  await expect(page.getByText("Changed Active CBT module")).toBeVisible();
  await expect(page.getByText(/by Kim Worker/).first()).toBeVisible();
});
