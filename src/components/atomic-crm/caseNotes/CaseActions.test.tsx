import { render } from "vitest-browser-react";
import {
  buildCaseAction,
  buildServiceUser,
  StoryWrapper,
} from "@/test/StoryWrapper";
import { CaseActions } from "./CaseActions";

const renderActions = (actions = [buildCaseAction()]) =>
  render(
    <StoryWrapper
      data={{
        service_users: [buildServiceUser({ id: 1 })],
        case_actions: actions,
      }}
    >
      <CaseActions serviceUserId={1} />
    </StoryWrapper>,
  );

describe("CaseActions", () => {
  it("adds an action with a due date", async () => {
    const screen = await renderActions([]);
    await expect.element(screen.getByText("No open actions")).toBeVisible();

    await screen.getByLabelText("New action").fill("Collect ID documents");
    await screen.getByLabelText("Due").fill("2099-01-15");
    await screen.getByRole("button", { name: "Add action" }).click();

    await expect.element(screen.getByText("Action added")).toBeVisible();
    await expect
      .element(screen.getByRole("checkbox", { name: "Collect ID documents" }))
      .not.toBeChecked();
    await expect.element(screen.getByText("Due 15 Jan")).toBeVisible();
  });

  it("marks an action done and moves it to recently done", async () => {
    const screen = await renderActions();

    await screen
      .getByRole("checkbox", { name: "Book GP registration" })
      .click();

    await expect.element(screen.getByText("Recently done")).toBeVisible();
    await expect
      .element(screen.getByRole("checkbox", { name: "Book GP registration" }))
      .toBeChecked();
    await expect.element(screen.getByText("No open actions")).toBeVisible();
  });

  it("flags an action whose due date has passed", async () => {
    const screen = await renderActions([
      buildCaseAction({ due_date: "2020-03-01" }),
    ]);

    await expect.element(screen.getByText("Overdue since 1 Mar")).toBeVisible();
  });
});
