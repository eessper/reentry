import { RecordContextProvider } from "ra-core";
import { render } from "vitest-browser-react";
import { buildServiceUser, StoryWrapper } from "@/test/StoryWrapper";
import { EscalationsForServiceUser } from "../escalations/EscalationsForServiceUser";
import type { SupportProfile } from "../types";
import { ConversationPreview } from "./ConversationPreview";

const serviceUser = buildServiceUser({ id: 1, display_name: "Jordan K." });
const profile: SupportProfile = {
  id: 1,
  service_user_id: 1,
  primary_risk_pathway: "substance_use",
  active_cbt_module: "urge_surfing",
  checkin_frequency: "daily",
  sentiment_dip_days: 3,
  missed_checkins_threshold: 2,
  keyword_sensitivity: 5,
  version: 1,
  updated_at: "2026-10-20T09:00:00.000Z",
  updated_by: null,
};

const renderPreview = () =>
  render(
    <StoryWrapper
      data={{ service_users: [serviceUser], support_profiles: [profile] }}
    >
      <RecordContextProvider value={serviceUser}>
        <ConversationPreview />
        <EscalationsForServiceUser serviceUserId={1} />
      </RecordContextProvider>
    </StoryWrapper>,
  );

const sendMessage = async (
  screen: Awaited<ReturnType<typeof renderPreview>>,
  text: string,
) => {
  await screen.getByLabelText("Message from the service user").fill(text);
  await screen.getByRole("button", { name: "Send" }).click();
};

describe("ConversationPreview", () => {
  it("opens with a check-in and answers a mood score", async () => {
    const screen = await renderPreview();
    await expect
      .element(screen.getByText(/Morning Jordan\. Day 2/))
      .toBeVisible();

    await sendMessage(screen, "7");

    await expect
      .element(screen.getByText(/Thanks for checking in, 7\/10 noted/))
      .toBeVisible();
  });

  it("opens an escalation on a risk message and pauses the assistant", async () => {
    const screen = await renderPreview();

    await sendMessage(screen, "I want to end it all");

    await expect
      .element(
        screen.getByText(
          "Risk screen matched: escalation opened, AI replies paused",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText(/Samaritans/).first()).toBeVisible();
    await expect.element(screen.getByText("Critical")).toBeVisible();
    await expect
      .element(screen.getByText(/AI replies are paused: an escalation is open/))
      .toBeVisible();

    await sendMessage(screen, "hello?");
    await expect
      .element(
        screen.getByText("AI replies paused while the escalation is open"),
      )
      .toBeVisible();
  });

  it("sends crisis contacts when nobody acknowledges in time", async () => {
    const screen = await renderPreview();
    await sendMessage(screen, "I'm using again");
    await expect.element(screen.getByText("High")).toBeVisible();

    await screen
      .getByRole("button", {
        name: "Simulate: nobody acknowledges within 15 minutes",
      })
      .click();

    await expect
      .element(screen.getByText(/Nobody from your team has been able to reply/))
      .toBeVisible();
  });
});
