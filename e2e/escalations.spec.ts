import { expect, test } from "./fixtures";

test("a key worker acknowledges and resolves an escalation", async ({
  page,
  createSales,
  createServiceUser,
  createEscalation,
  signIn,
  menu,
}) => {
  const kim = await createSales({
    email: "kim@example.test",
    first_name: "Kim",
    last_name: "Worker",
    password: "password",
  });
  const ari = await createServiceUser({
    display_name: "Ari U.",
    reference_code: "RE-10001",
    assigned_worker_id: kim.id,
  });
  await createEscalation({
    service_user_id: ari.id,
    notes: "Message mentioned feeling unsafe at night.",
  });

  await signIn("kim@example.test");
  await expect(page.getByText("1 high or critical")).toBeVisible();
  await menu.goToEscalations();

  const escalation = page.getByRole("listitem", { name: "Keyword" });
  await expect(escalation.getByText("Ari U.")).toBeVisible();
  await escalation.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("Escalation acknowledged")).toBeVisible();
  await expect(escalation.getByText("Acknowledged")).toBeVisible();

  await escalation.getByRole("button", { name: "Resolve" }).click();
  await page
    .getByLabel("Notes")
    .fill("Called back; staying with a friend tonight.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve" })
    .click();
  await expect(page.getByText("Escalation resolved")).toBeVisible();
  await expect(
    page.getByText("Nothing needs attention right now"),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Resolved" }).click();
  await expect(
    page.getByText("Called back; staying with a friend tonight."),
  ).toBeVisible();
});
