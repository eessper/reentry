import type { EscalationSeverity } from "../types";

/**
 * The deterministic risk screen every incoming message goes through before
 * anything else (no AI). Phase 2 runs the same rules in the WhatsApp engine;
 * the Control Tower preview runs them in the browser.
 *
 * Each rule has a minimum keyword sensitivity (the profile's 1-10 setting):
 * the most serious rules always apply, milder ones only for people whose
 * profile asks for a more sensitive screen.
 */
export type RiskRule = {
  id: "self_harm" | "harm_to_others" | "relapse" | "distress" | "housing_loss";
  severity: EscalationSeverity;
  minSensitivity: number;
  phrases: readonly string[];
};

export const RISK_RULES: readonly RiskRule[] = [
  {
    id: "self_harm",
    severity: "critical",
    minSensitivity: 1,
    phrases: [
      "kill myself",
      "end my life",
      "end it all",
      "suicide",
      "suicidal",
      "want to die",
      "better off dead",
      "dont want to be here",
      "hurt myself",
      "self harm",
      "overdose",
    ],
  },
  {
    id: "harm_to_others",
    severity: "critical",
    minSensitivity: 1,
    phrases: [
      "hurt someone",
      "kill him",
      "kill her",
      "kill them",
      "carrying a knife",
      "got a knife",
      "weapon",
      "going to hurt",
    ],
  },
  {
    id: "relapse",
    severity: "high",
    minSensitivity: 4,
    phrases: [
      "using again",
      "used again",
      "relapsed",
      "relapse",
      "drinking again",
      "scored",
      "need a fix",
    ],
  },
  {
    id: "distress",
    severity: "medium",
    minSensitivity: 7,
    phrases: [
      "hopeless",
      "cant cope",
      "cant take it",
      "give up",
      "no point",
      "nobody cares",
      "unsafe",
    ],
  },
  {
    id: "housing_loss",
    severity: "medium",
    minSensitivity: 7,
    phrases: ["kicked out", "sleeping rough", "homeless", "nowhere to sleep"],
  },
];

export type RiskResult =
  | { isRisk: false }
  | { isRisk: true; rule: RiskRule["id"]; severity: EscalationSeverity };

const SEVERITY_ORDER: readonly EscalationSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

/** Lowercase, drop apostrophes and punctuation, collapse spaces. */
export const normaliseMessage = (text: string): string =>
  ` ${text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/**
 * Screens one message. Returns the most severe rule it matches at this
 * sensitivity, or no risk. Phrases match whole words only.
 */
export const screenMessage = (
  text: string,
  sensitivity: number,
): RiskResult => {
  const message = normaliseMessage(text);
  const matches = RISK_RULES.filter(
    (rule) =>
      sensitivity >= rule.minSensitivity &&
      rule.phrases.some((phrase) => message.includes(` ${phrase} `)),
  );
  if (matches.length === 0) return { isRisk: false };
  const worst = matches.reduce((a, b) =>
    SEVERITY_ORDER.indexOf(b.severity) > SEVERITY_ORDER.indexOf(a.severity)
      ? b
      : a,
  );
  return { isRisk: true, rule: worst.id, severity: worst.severity };
};
