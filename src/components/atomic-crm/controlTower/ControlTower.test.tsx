import { render } from "vitest-browser-react";
import {
  buildServiceUser,
  createTestAuthProvider,
  StoryWrapper,
} from "@/test/StoryWrapper";
import type { ControlTowerStats, MembershipRole } from "../types";
import { ControlTower } from "./ControlTower";

const stats: ControlTowerStats = {
  scope: "organisation",
  active_clients: 15,
  checkins_completed: 83,
  checkins_missed: 7,
  checkin_adherence: 92,
  open_escalations: 4,
  urgent_escalations: 2,
  stability: [{ day: "2026-10-21", stable: 10, watch: 3, critical: 2 }],
};

const renderAs = (role: MembershipRole) =>
  render(
    <StoryWrapper
      authProvider={{
        getIdentity: async () => ({
          ...(await createTestAuthProvider().getIdentity!()),
          role,
        }),
      }}
      dataProvider={{ getControlTowerStats: async () => stats }}
      data={{
        service_users: [
          buildServiceUser({
            id: 1,
            display_name: "Oz Q.",
            stability: "critical",
          }),
        ],
      }}
    >
      <ControlTower />
    </StoryWrapper>,
  );

describe("ControlTower", () => {
  it("shows the KPI figures", async () => {
    const screen = await renderAs("clinical_lead");

    await expect.element(screen.getByText("92%")).toBeVisible();
    await expect.element(screen.getByText("2 high or critical")).toBeVisible();
  });

  it("shows staff the cohort with its status dots", async () => {
    const screen = await renderAs("key_worker");

    await expect.element(screen.getByText("Oz Q.")).toBeVisible();
    await expect
      .element(screen.getByText("Critical").first())
      .toBeInTheDocument();
  });

  it("gives viewers aggregates only, with no individual records", async () => {
    const screen = await renderAs("viewer");

    await expect.element(screen.getByText("15")).toBeVisible();
    await expect
      .element(screen.getByText(/Individual records are hidden/))
      .toBeVisible();
    await expect.element(screen.getByText("Cohort")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Oz Q.")).not.toBeInTheDocument();
  });
});
