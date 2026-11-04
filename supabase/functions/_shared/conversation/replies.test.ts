// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  escalationNote,
  moodScore,
  openingMessage,
  replyTo,
} from "./replies.ts";

describe("moodScore", () => {
  it("reads a bare number or 'mood N' as a check-in score", () => {
    expect(moodScore("7")).toBe(7);
    expect(moodScore("Mood 3")).toBe(3);
    expect(moodScore("6/10")).toBe(6);
  });

  it("ignores numbers outside 1 to 10 and longer messages", () => {
    expect(moodScore("0")).toBeNull();
    expect(moodScore("11")).toBeNull();
    expect(moodScore("I have 2 appointments")).toBeNull();
  });
});

describe("replyTo", () => {
  it("logs a check-in and offers support on a low score", () => {
    const reply = replyTo("3", "urge_surfing");
    expect(reply.event).toEqual({
      type: "checkin",
      summary: "Check-in completed, mood 3/10",
    });
    expect(reply.text).toContain("exercise");
  });

  it("sends the profile's CBT exercise when they are struggling", () => {
    expect(
      replyTo("Having bad cravings tonight", "urge_surfing"),
    ).toMatchObject({
      event: { type: "cbt_deploy", summary: "Urge surfing exercise sent" },
    });
  });

  it("falls back to distress tolerance when no CBT module is set", () => {
    expect(replyTo("really stressed", null).event?.summary).toBe(
      "Distress tolerance exercise sent",
    );
  });

  it("treats appointment questions as logistics", () => {
    expect(replyTo("When is my probation appointment?", null).event).toEqual({
      type: "logistics",
      summary: "Asked for help with logistics",
    });
  });

  it("answers anything else without logging an event", () => {
    expect(replyTo("Watched the football last night", null).event).toBe(
      undefined,
    );
  });
});

describe("openingMessage", () => {
  it("greets by first name with the programme day", () => {
    expect(openingMessage("Jordan K.", 4)).toContain("Morning Jordan. Day 4");
  });
});

describe("escalationNote", () => {
  it("names the rule, not the message", () => {
    expect(
      escalationNote({ isRisk: true, rule: "self_harm", severity: "critical" }),
    ).toBe(
      "Risk screen matched the self harm rule in a message (conversation preview).",
    );
  });
});
