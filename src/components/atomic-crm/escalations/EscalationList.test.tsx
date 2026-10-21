import { render } from "vitest-browser-react";
import {
  buildEscalation,
  buildServiceUser,
  StoryWrapper,
} from "@/test/StoryWrapper";
import { EscalationList } from "./EscalationList";

describe("EscalationList", () => {
  it("drops an escalation from the queue once it is resolved", async () => {
    const screen = await render(
      <StoryWrapper
        data={{
          service_users: [buildServiceUser({ id: 1, display_name: "Ari U." })],
          escalations: [buildEscalation({ id: 1, service_user_id: 1 })],
        }}
      >
        <EscalationList />
      </StoryWrapper>,
    );

    await expect.element(screen.getByText("Ari U. (RE-43714)")).toBeVisible();
    await screen.getByRole("button", { name: "Resolve" }).click();
    await screen.getByLabelText("Notes").fill("Called back, safe tonight");
    await screen
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve" })
      .click();

    await expect
      .element(screen.getByText("Nothing needs attention right now"))
      .toBeVisible();
  });
});
