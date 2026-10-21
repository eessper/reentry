import { expect, test } from "./fixtures";

// Re-entry has no self-signup: an organisation's first admin is created by an
// operator (scripts/create-organisation.mjs), then signs in.
test("an org admin lands on the Control Tower and can manage the team", async ({
  page,
  isMobile,
  createSales,
  signIn,
}) => {
  await createSales({
    email: "admin@example.test",
    first_name: "Ada",
    last_name: "Admin",
    password: "password",
    role: "org_admin",
  });
  await createSales({
    email: "kim@example.test",
    first_name: "Kim",
    last_name: "Worker",
    password: "password",
  });

  await signIn("admin@example.test");

  await expect(page).toHaveTitle(/Re-entry/);
  await expect(page.getByText("Active clients")).toBeVisible();
  test.skip(isMobile, "Team management is a desktop screen");

  await page.getByRole("link", { name: "Team" }).click();
  await expect(page.getByText("Kim")).toBeVisible();
  await expect(page.getByText("Key worker")).toBeVisible();
});
