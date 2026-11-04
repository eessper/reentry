import { buildEscalation } from "@/test/StoryWrapper";
import type { ActivityEvent } from "../../../types";
import { demoStability } from "./demoStability";

const NOW = new Date("2026-11-02T12:00:00Z").getTime();
const person = { id: 1, risk_tier: "moderate" as const };
const missedCheckin = (hoursAgo: number): ActivityEvent => ({
  id: 1,
  service_user_id: 1,
  type: "missed_checkin",
  summary: "Missed the morning check-in",
  actor_sales_id: null,
  created_at: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
});

describe("demoStability", () => {
  it("is critical with an unresolved high or critical escalation", () => {
    expect(
      demoStability(
        person,
        [buildEscalation({ severity: "critical" })],
        [],
        NOW,
      ),
    ).toBe("critical");
  });

  it("is back to stable once that escalation is resolved", () => {
    expect(
      demoStability(
        person,
        [buildEscalation({ severity: "critical", status: "resolved" })],
        [],
        NOW,
      ),
    ).toBe("stable");
  });

  it("is watch after a missed check-in in the last 48 hours, not older", () => {
    expect(demoStability(person, [], [missedCheckin(10)], NOW)).toBe("watch");
    expect(demoStability(person, [], [missedCheckin(60)], NOW)).toBe("stable");
  });

  it("is watch for a high risk tier", () => {
    expect(demoStability({ id: 1, risk_tier: "high" }, [], [], NOW)).toBe(
      "watch",
    );
  });
});
