import { useEffect, useRef, useState } from "react";
import { MessageCircle, PauseCircle, RotateCcw } from "lucide-react";
import { useRecordContext, useTranslate } from "ra-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { ServiceUser } from "../types";
import { type ConversationMessage, useConversation } from "./useConversation";

/**
 * A simulated WhatsApp conversation on the profile: a preview of the Phase 2
 * engine for demos and training. Staff type as the service user; the
 * deterministic risk screen and scripted replies answer.
 */
export const ConversationPreview = () => {
  const record = useRecordContext<ServiceUser>();
  if (!record) return null;
  return <ConversationPreviewContent serviceUser={record} />;
};

const ConversationPreviewContent = ({
  serviceUser,
}: {
  serviceUser: ServiceUser;
}) => {
  const translate = useTranslate();
  const {
    messages,
    send,
    isSending,
    isPaused,
    isAwaitingStaff,
    simulateNoStaffReply,
    reset,
  } = useConversation(serviceUser);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {translate("crm.conversation.title")}
          </h2>
          <Badge variant="outline">
            {translate("crm.conversation.simulated")}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={reset}
            aria-label={translate("crm.conversation.reset")}
          >
            <RotateCcw />
          </Button>
        </div>
        {isPaused ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm"
          >
            <PauseCircle className="size-4 mt-0.5 shrink-0" />
            <span>{translate("crm.conversation.paused")}</span>
          </div>
        ) : null}
        <div
          className="flex flex-col gap-2 rounded-md bg-muted/40 p-3 h-80 overflow-y-auto"
          aria-label={translate("crm.conversation.title")}
          role="log"
        >
          {messages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
          <div ref={endRef} />
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
            setDraft("");
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={translate("crm.conversation.placeholder", {
              name: serviceUser.display_name,
            })}
            aria-label={translate("crm.conversation.message_label")}
          />
          <Button type="submit" disabled={isSending || !draft.trim()}>
            {translate("crm.conversation.send")}
          </Button>
        </form>
        {isAwaitingStaff ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={simulateNoStaffReply}
          >
            {translate("crm.conversation.simulate_no_reply")}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {translate("crm.conversation.disclaimer")}
        </p>
      </CardContent>
    </Card>
  );
};

const Bubble = ({ message }: { message: ConversationMessage }) => {
  const translate = useTranslate();
  if (message.from === "system") {
    return (
      <p className="self-center text-center text-xs text-muted-foreground px-2">
        {translate(`crm.conversation.system.${message.text}`)}
      </p>
    );
  }
  return (
    <p
      className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
        message.from === "service_user"
          ? "self-end bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50"
          : "self-start bg-background border",
      )}
    >
      {message.text}
    </p>
  );
};
