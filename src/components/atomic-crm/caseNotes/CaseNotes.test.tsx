import { render } from "vitest-browser-react";
import {
  buildCaseNote,
  buildServiceUser,
  StoryWrapper,
} from "@/test/StoryWrapper";
import { CaseNotes } from "./CaseNotes";

describe("CaseNotes", () => {
  it("lists a service user's notes with their author", async () => {
    const screen = await render(
      <StoryWrapper
        data={{
          service_users: [buildServiceUser({ id: 1 })],
          case_notes: [
            buildCaseNote({ id: 1, service_user_id: 1 }),
            buildCaseNote({ id: 2, service_user_id: 2, body: "Someone else" }),
          ],
        }}
      >
        <CaseNotes serviceUserId={1} />
      </StoryWrapper>,
    );

    await expect
      .element(
        screen.getByText("Talked through the housing appointment on Thursday."),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Jane Doe")).toBeVisible();
    await expect
      .element(screen.getByText("Someone else"))
      .not.toBeInTheDocument();
  });

  it("adds a note and shows it straight away", async () => {
    const screen = await render(
      <StoryWrapper data={{ service_users: [buildServiceUser({ id: 1 })] }}>
        <CaseNotes serviceUserId={1} />
      </StoryWrapper>,
    );
    await expect.element(screen.getByText("No case notes yet")).toBeVisible();
    const add = screen.getByRole("button", { name: "Add note" });
    await expect.element(add).toBeDisabled();

    await screen
      .getByLabelText("New case note")
      .fill("Seemed settled, new flat feels safe");
    await add.click();

    await expect.element(screen.getByText("Case note added")).toBeVisible();
    await expect
      .element(screen.getByText("Seemed settled, new flat feels safe"))
      .toBeVisible();
    await expect
      .element(screen.getByLabelText("New case note"))
      .toHaveValue("");
  });
});
