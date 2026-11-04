import type { ActivityEventType, CbtModule } from "./types.ts";
import type { RiskResult } from "./riskScreen.ts";
import { normaliseMessage } from "./riskScreen.ts";

/**
 * Scripted replies, shared by the Control Tower's WhatsApp preview and the
 * Phase 2 WhatsApp engine: check-ins, logistics help, CBT exercises, and the
 * fixed safety messages (handover, holding reply, crisis contacts). No AI is
 * involved; the engine's AI-assisted replies are a separate step after these.
 */

/** UK crisis contacts sent instead of silence (brief, Phase 2 rules). */
export const CRISIS_CONTACTS =
  "If you are in danger right now, call 999. You can talk to Samaritans any time, free, on 116 123. For urgent mental health help, call NHS 111 and choose option 2.";

export const HANDOVER_MESSAGE =
  "Thank you for telling me. I've asked your support team to contact you now, and I'll stay quiet so a person can take it from here.";

export const NO_REPLY_FROM_STAFF_MESSAGE = `Nobody from your team has been able to reply yet, and I don't want you to be on your own with this. ${CRISIS_CONTACTS}`;

export const PAUSED_REPLY =
  "Your support team has your message and will reply. If you are in danger, call 999 or Samaritans on 116 123.";

export type ReplyEvent = { type: ActivityEventType; summary: string };
export type Reply = { text: string; event?: ReplyEvent };

const CBT_EXERCISES: Record<CbtModule, { name: string; prompt: string }> = {
  distress_tolerance: {
    name: "Distress tolerance",
    prompt:
      "Let's try something quick for when it all feels too much. Hold something cold, or splash water on your face, and breathe out slowly for a count of six. Do it five times, then tell me how it went.",
  },
  cognitive_reframing: {
    name: "Cognitive reframing",
    prompt:
      "What's the thought that's bothering you most? Write it down, then ask: what would I say to a mate who thought this? Send me the kinder version.",
  },
  emotional_regulation: {
    name: "Emotional regulation",
    prompt:
      "Let's name it first. On a scale of 1 to 10, how strong is the feeling, and where do you notice it in your body? Naming it takes some of the heat out.",
  },
  urge_surfing: {
    name: "Urge surfing",
    prompt:
      "Cravings come in waves: they build, peak and pass, usually within 20 to 30 minutes. Notice where you feel it, breathe with it, and ride it out. I'll check back in 20 minutes.",
  },
  radical_acceptance: {
    name: "Radical acceptance",
    prompt:
      "Some things today are out of your hands. Try saying: 'This is how it is right now, and I can still choose my next step.' What's one small next step?",
  },
};

const LOGISTICS_WORDS = [
  "appointment",
  "probation",
  "housing",
  "hostel",
  "job centre",
  "jobcentre",
  "universal credit",
  "benefits",
  "bus",
  "train",
  "address",
  "doctor",
  "gp",
  "id",
];

const LOW_MOOD_WORDS = [
  "stressed",
  "anxious",
  "angry",
  "low",
  "sad",
  "craving",
  "cravings",
  "urge",
  "urges",
  "wound up",
  "struggling",
];

const includesAny = (message: string, words: readonly string[]) =>
  words.some((word) => message.includes(` ${word} `));

/** A mood score when the message is just a number from 1 to 10, or "mood 6". */
export const moodScore = (text: string): number | null => {
  const match = normaliseMessage(text).match(/^ (?:mood )?(\d{1,2})(?: 10)? $/);
  if (!match) return null;
  const score = Number(match[1]);
  return score >= 1 && score <= 10 ? score : null;
};

/** The first message of the day, as the engine would send it. */
export const openingMessage = (displayName: string, programmeDay: number) =>
  `Morning ${displayName.split(" ")[0]}. Day ${programmeDay} of your programme. How are you feeling today, from 1 to 10?`;

/** What the assistant says to a message that passed the risk screen. */
export const replyTo = (text: string, cbtModule: CbtModule | null): Reply => {
  const score = moodScore(text);
  if (score != null) {
    const text =
      score <= 4
        ? `Thanks for being honest. ${score}/10 sounds hard. Do you want to try a short exercise, or would you rather your key worker gave you a call?`
        : `Thanks for checking in, ${score}/10 noted. Anything you need help with today: appointments, travel, money?`;
    return {
      text,
      event: {
        type: "checkin",
        summary: `Check-in completed, mood ${score}/10`,
      },
    };
  }

  const message = normaliseMessage(text);
  if (includesAny(message, LOW_MOOD_WORDS)) {
    const exercise = CBT_EXERCISES[cbtModule ?? "distress_tolerance"];
    return {
      text: exercise.prompt,
      event: {
        type: "cbt_deploy",
        summary: `${exercise.name} exercise sent`,
      },
    };
  }
  if (includesAny(message, LOGISTICS_WORDS)) {
    return {
      text: "I can help with that. I've let your key worker know, and I'll send you the time, address and how to get there as soon as it's confirmed.",
      event: { type: "logistics", summary: "Asked for help with logistics" },
    };
  }
  return {
    text: "Thanks for letting me know. I'm here whenever you want to talk, and your key worker can see how you're getting on.",
  };
};

/** The escalation summary staff see: the rule that fired, never the message itself. */
export const escalationNote = (risk: Extract<RiskResult, { isRisk: true }>) =>
  `Risk screen matched the ${risk.rule.replace(/_/g, " ")} rule in a message (conversation preview).`;
