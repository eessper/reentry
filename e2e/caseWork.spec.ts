import { expect, test } from "./fixtures";

test("a key worker writes a case note and an action, both in the audit trail", async ({
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

  await page
    .getByLabel("New case note")
    .fill("Called after the hostel move, settling in.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Case note added")).toBeVisible();
  await expect(
    page.getByText("Called after the hostel move, settling in."),
  ).toBeVisible();

  await page.getByLabel("New action").fill("Book GP registration");
  await page.getByRole("button", { name: "Add action" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Book GP registration" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Book GP registration" }).click();
  await expect(page.getByText("Recently done")).toBeVisible();

  const trail = page.getByRole("list").filter({ hasText: "Record opened" });
  await expect(trail.getByText("Case note added")).toBeVisible();
  await expect(trail.getByText("Action updated")).toBeVisible();
});

test("a risk message in the WhatsApp preview opens an escalation and pauses replies", async ({
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

  const message = page.getByLabel("Message from the service user");
  await message.fill("I want to end it all");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText(/AI replies are paused: an escalation is open/),
  ).toBeVisible();
  await expect(page.getByText(/Samaritans/).first()).toBeVisible();
  await expect(page.getByText("Critical").first()).toBeVisible();

  // Resolving the escalation lets the assistant reply again
  await page.getByRole("button", { name: "Resolve" }).first().click();
  await page.getByLabel("Notes").fill("Spoke on the phone, safe tonight");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve" })
    .click();
  await expect(page.getByText("Escalation resolved")).toBeVisible();
  await expect(
    page.getByText(/AI replies are paused: an escalation is open/),
  ).not.toBeVisible();

  await message.fill("7");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/7\/10 noted/)).toBeVisible();
});
