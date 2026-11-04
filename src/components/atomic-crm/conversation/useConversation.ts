import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useGetList, useNotify } from "ra-core";

import type {
  ActivityEvent,
  Escalation,
  ServiceUser,
  SupportProfile,
} from "../types";
import {
  CRISIS_CONTACTS,
  escalationNote,
  HANDOVER_MESSAGE,
  NO_REPLY_FROM_STAFF_MESSAGE,
  openingMessage,
  PAUSED_REPLY,
  replyTo,
  type ReplyEvent,
} from "../../../../supabase/functions/_shared/conversation/replies.ts";
import { screenMessage } from "../../../../supabase/functions/_shared/conversation/riskScreen.ts";

export type ConversationMessage = {
  id: number;
  from: "service_user" | "assistant" | "system";
  text: string;
};

const DEFAULT_SENSITIVITY = 5;

/**
 * Runs the simulated conversation for one service user. Every message goes
 * through the risk screen first: a match opens an escalation and pauses the
 * assistant until staff resolve it (an unresolved escalation means paused).
 * Escalations and activity events are real records; the messages themselves
 * only live in this component's state.
 */
export const useConversation = (serviceUser: ServiceUser) => {
  const dataProvider = useDataProvider();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const opening = (): ConversationMessage[] => [
    {
      id: 0,
      from: "assistant",
      text: openingMessage(serviceUser.display_name, serviceUser.programme_day),
    },
  ];
  const [messages, setMessages] = useState<ConversationMessage[]>(opening);
  const [isSending, setIsSending] = useState(false);

  const openEscalationsQuery = {
    pagination: { page: 1, perPage: 20 },
    sort: { field: "opened_at", order: "DESC" as const },
    filter: { service_user_id: serviceUser.id, "status@neq": "resolved" },
  };
  // For the banner and buttons. Sending re-reads the database instead, so
  // the pause never depends on whether this list has loaded yet.
  const { data: escalations = [] } = useGetList<Escalation>(
    "escalations",
    openEscalationsQuery,
  );
  const isPaused = escalations.length > 0;
  const isAwaitingStaff = escalations.some(
    (escalation) => escalation.status === "open",
  );

  const say = (from: ConversationMessage["from"], text: string) =>
    setMessages((current) => [...current, { id: current.length, from, text }]);

  const refresh = () => {
    for (const queryKey of [
      ["escalations"],
      ["activity_events"],
      ["service_users"],
      ["controlTowerStats"],
      ["serviceUserHistory"],
    ]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const recordEvent = (event: ReplyEvent) =>
    dataProvider.create<ActivityEvent>("activity_events", {
      data: { service_user_id: serviceUser.id, ...event },
    });

  const hasOpenEscalation = async () =>
    (
      await dataProvider.getList<Escalation>(
        "escalations",
        openEscalationsQuery,
      )
    ).data.length > 0;

  const currentProfile = async (): Promise<SupportProfile | undefined> =>
    (
      await dataProvider.getList<SupportProfile>("support_profiles", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: { service_user_id: serviceUser.id },
      })
    ).data[0];

  const handle = async (text: string) => {
    const [isPausedNow, profile] = await Promise.all([
      hasOpenEscalation(),
      currentProfile(),
    ]);
    if (isPausedNow) {
      say("system", "assistant_paused");
      say("assistant", PAUSED_REPLY);
      return;
    }
    const risk = screenMessage(
      text,
      profile?.keyword_sensitivity ?? DEFAULT_SENSITIVITY,
    );
    if (risk.isRisk) {
      await dataProvider.create<Escalation>("escalations", {
        data: {
          service_user_id: serviceUser.id,
          trigger_type: "keyword",
          severity: risk.severity,
          notes: escalationNote(risk),
        },
      });
      await recordEvent({
        type: "escalation",
        summary: `Risk screen opened a ${risk.severity} escalation`,
      });
      say("system", "escalation_opened");
      say(
        "assistant",
        risk.severity === "critical"
          ? `${HANDOVER_MESSAGE} ${CRISIS_CONTACTS}`
          : HANDOVER_MESSAGE,
      );
      return;
    }
    const reply = replyTo(text, profile?.active_cbt_module ?? null);
    if (reply.event) await recordEvent(reply.event);
    say("assistant", reply.text);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    say("service_user", trimmed);
    setIsSending(true);
    try {
      await handle(trimmed);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), {
        type: "error",
      });
    } finally {
      setIsSending(false);
      refresh();
    }
  };

  /** What happens when nobody acknowledges an escalation in time. */
  const simulateNoStaffReply = async () => {
    say("system", "no_staff_reply");
    say("assistant", NO_REPLY_FROM_STAFF_MESSAGE);
    try {
      await recordEvent({
        type: "escalation",
        summary: "Crisis contacts sent: escalation not acknowledged in time",
      });
    } finally {
      refresh();
    }
  };

  const reset = () => setMessages(opening());

  return {
    messages,
    send,
    isSending,
    isPaused,
    isAwaitingStaff,
    simulateNoStaffReply,
    reset,
  };
};
