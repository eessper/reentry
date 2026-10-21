import { render } from "vitest-browser-react";
import { buildEscalation, StoryWrapper } from "@/test/StoryWrapper";
import type { Escalation } from "../types";
import { EscalationActions } from "./EscalationActions";

const renderActions = (escalation: Escalation, update = vi.fn()) =>
  render(
    <StoryWrapper
      data={{ escalations: [escalation] }}
      dataProvider={{
        update: async (resource: string, params: any) => {
          update(resource, params.data);
          return { data: { ...escalation, ...params.data } };
        },
      }}
    >
      <EscalationActions escalation={escalation} />
    </StoryWrapper>,
  );

describe("EscalationActions", () => {
  it("acknowledges an open escalation", async () => {
    const update = vi.fn();
    const screen = await renderActions(buildEscalation(), update);

    await screen.getByRole("button", { name: "Acknowledge" }).click();

    await expect
      .element(screen.getByText("Escalation acknowledged"))
      .toBeVisible();
    expect(update).toHaveBeenCalledWith("escalations", {
      status: "acknowledged",
    });
  });

  it("asks what was done before resolving, and records it", async () => {
    const update = vi.fn();
    const screen = await renderActions(
      buildEscalation({ status: "acknowledged", notes: null }),
      update,
    );

    await screen.getByRole("button", { name: "Resolve" }).click();
    const confirm = screen
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve" });
    await expect.element(confirm).toBeDisabled();
    await screen
      .getByLabelText("Notes")
      .fill("Called back, safe at a friend's tonight");
    await confirm.click();

    await expect.element(screen.getByText("Escalation resolved")).toBeVisible();
    expect(update).toHaveBeenCalledWith("escalations", {
      status: "resolved",
      notes: "Called back, safe at a friend's tonight",
    });
  });

  it("offers no actions on a resolved escalation", async () => {
    const screen = await renderActions(buildEscalation({ status: "resolved" }));

    await expect
      .element(screen.getByRole("button", { name: "Resolve" }))
      .not.toBeInTheDocument();
  });
});
