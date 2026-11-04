import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { Escalation } from "../types";

/**
 * Acknowledge and resolve. The database stamps the times and records who did
 * it in the audit log; resolving asks what was done, for the record.
 */
export const EscalationActions = ({
  escalation,
}: {
  escalation: Escalation;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [update, { isPending }] = useUpdate<Escalation>();
  const [isResolving, setIsResolving] = useState(false);
  const [notes, setNotes] = useState(escalation.notes ?? "");

  const changeStatus = (
    status: Escalation["status"],
    extra: Partial<Escalation> = {},
  ) =>
    update(
      "escalations",
      {
        id: escalation.id,
        data: { status, ...extra },
        previousData: escalation,
      },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          setIsResolving(false);
          notify(`resources.escalations.notifications.${status}`);
          // The update only patches the cached record: refetch so a resolved
          // escalation leaves the queue, and the counts and status dots follow.
          for (const queryKey of [
            ["escalations"],
            ["service_users"],
            ["controlTowerStats"],
            ["serviceUserHistory"],
          ]) {
            queryClient.invalidateQueries({ queryKey });
          }
        },
        onError: (error) =>
          notify(error instanceof Error ? error.message : String(error), {
            type: "error",
          }),
      },
    );

  if (escalation.status === "resolved") return null;

  return (
    <div className="flex gap-2">
      {escalation.status === "open" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => changeStatus("acknowledged")}
        >
          {translate("resources.escalations.actions.acknowledge")}
        </Button>
      ) : null}
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => setIsResolving(true)}
      >
        {translate("resources.escalations.actions.resolve")}
      </Button>
      <Dialog open={isResolving} onOpenChange={setIsResolving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {translate("resources.escalations.actions.resolve_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`resolve-notes-${escalation.id}`}>
              {translate("resources.escalations.fields.notes")}
            </Label>
            <Textarea
              id={`resolve-notes-${escalation.id}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={translate(
                "resources.escalations.actions.notes_help",
              )}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={isPending || notes.trim().length === 0}
              onClick={() => changeStatus("resolved", { notes: notes.trim() })}
            >
              {translate("resources.escalations.actions.resolve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
