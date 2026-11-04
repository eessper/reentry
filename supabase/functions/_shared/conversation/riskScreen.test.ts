// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normaliseMessage, screenMessage } from "./riskScreen.ts";

describe("screenMessage", () => {
  it("flags self-harm as critical at any sensitivity", () => {
    expect(screenMessage("Honestly I want to die", 1)).toEqual({
      isRisk: true,
      rule: "self_harm",
      severity: "critical",
    });
  });

  it("matches despite capitals, apostrophes and punctuation", () => {
    expect(
      screenMessage("I DON'T want to be here anymore...", 5),
    ).toMatchObject({
      isRisk: true,
      rule: "self_harm",
    });
  });

  it("flags relapse from sensitivity 4, not below", () => {
    expect(screenMessage("I'm using again", 3)).toEqual({ isRisk: false });
    expect(screenMessage("I'm using again", 4)).toEqual({
      isRisk: true,
      rule: "relapse",
      severity: "high",
    });
  });

  it("flags milder distress only on a sensitive profile", () => {
    expect(screenMessage("feeling hopeless today", 6)).toEqual({
      isRisk: false,
    });
    expect(screenMessage("feeling hopeless today", 7)).toMatchObject({
      isRisk: true,
      rule: "distress",
      severity: "medium",
    });
  });

  it("reports the most severe rule when several match", () => {
    expect(screenMessage("relapsed and I might hurt myself", 10)).toMatchObject(
      { rule: "self_harm", severity: "critical" },
    );
  });

  it("matches whole words only", () => {
    expect(screenMessage("The weaponry exhibit was fun", 10)).toEqual({
      isRisk: false,
    });
  });

  it("lets ordinary messages through", () => {
    expect(
      screenMessage("Can you remind me about probation on Tuesday?", 10),
    ).toEqual({ isRisk: false });
  });
});

describe("normaliseMessage", () => {
  it("pads with spaces so phrases can be matched on word boundaries", () => {
    expect(normaliseMessage("Can't cope!")).toBe(" cant cope ");
  });
});
