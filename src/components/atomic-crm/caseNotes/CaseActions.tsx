import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ListChecks } from "lucide-react";
import {
  RecordContextProvider,
  useCreate,
  useGetIdentity,
  useGetList,
  useNotify,
  useTranslate,
  useUpdate,
} from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CaseAction, ServiceUser } from "../types";
import { isOverdue } from "./caseActionDates";

const MAX_TITLE_LENGTH = 200;
const DONE_SHOWN = 5;

/**
 * Follow-ups agreed for a service user. Ticking one marks it done (and
 * unticking reopens it); every change is in the audit trail.
 */
export const CaseActions = ({
  serviceUserId,
}: {
  serviceUserId: ServiceUser["id"];
}) => {
  const translate = useTranslate();
  const { data = [] } = useGetList<CaseAction>("case_actions", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "created_at", order: "DESC" },
    filter: { service_user_id: serviceUserId },
  });
  const open = data.filter((action) => action.done_at == null).sort(byDueDate);
  const done = data
    .filter((action) => action.done_at != null)
    .slice(0, DONE_SHOWN);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ListChecks className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {translate("resources.case_actions.name", { smart_count: 2 })}
          </h2>
        </div>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.case_actions.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((action) => (
              <CaseActionItem key={action.id} action={action} />
            ))}
          </ul>
        )}
        <NewCaseAction serviceUserId={serviceUserId} />
        {done.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {translate("resources.case_actions.recently_done")}
            </h3>
            <ul className="flex flex-col gap-2">
              {done.map((action) => (
                <CaseActionItem key={action.id} action={action} />
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

// Soonest due first; actions with no date last.
const byDueDate = (a: CaseAction, b: CaseAction) =>
  (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");

const useRefreshCaseActions = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["case_actions"] });
    queryClient.invalidateQueries({ queryKey: ["serviceUserHistory"] });
  };
};

const CaseActionItem = ({ action }: { action: CaseAction }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefreshCaseActions();
  const [update, { isPending }] = useUpdate<CaseAction>();
  const isDone = action.done_at != null;
  const overdue = !isDone && isOverdue(action.due_date, new Date());

  const toggle = () =>
    update(
      "case_actions",
      {
        id: action.id,
        data: { done_at: isDone ? null : new Date().toISOString() },
        previousData: action,
      },
      {
        mutationMode: "pessimistic",
        onSuccess: refresh,
        onError: (error) =>
          notify(error instanceof Error ? error.message : String(error), {
            type: "error",
          }),
      },
    );

  return (
    <RecordContextProvider value={action}>
      <li className="flex items-start gap-3 text-sm">
        <Checkbox
          id={`case-action-${action.id}`}
          checked={isDone}
          disabled={isPending}
          onCheckedChange={toggle}
          className="mt-0.5"
        />
        <div className="flex flex-col">
          <label
            htmlFor={`case-action-${action.id}`}
            className={isDone ? "line-through text-muted-foreground" : ""}
          >
            {action.title}
          </label>
          <span className="text-xs text-muted-foreground">
            {action.due_date ? (
              <span className={overdue ? "text-destructive font-medium" : ""}>
                {translate(
                  overdue
                    ? "resources.case_actions.overdue"
                    : "resources.case_actions.due",
                  { date: format(new Date(action.due_date), "d MMM") },
                )}
              </span>
            ) : null}
            {action.due_date && action.assigned_to != null ? " · " : null}
            {action.assigned_to != null ? (
              <ReferenceField
                source="assigned_to"
                reference="sales"
                link={false}
              />
            ) : null}
          </span>
        </div>
      </li>
    </RecordContextProvider>
  );
};

const NewCaseAction = ({
  serviceUserId,
}: {
  serviceUserId: ServiceUser["id"];
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefreshCaseActions();
  const { identity } = useGetIdentity();
  const [create, { isPending }] = useCreate<CaseAction>();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const trimmed = title.trim();

  const save = () =>
    create(
      "case_actions",
      {
        data: {
          service_user_id: serviceUserId,
          title: trimmed,
          due_date: dueDate || null,
          assigned_to: identity?.id ?? null,
        },
      },
      {
        onSuccess: () => {
          setTitle("");
          setDueDate("");
          notify("resources.case_actions.notifications.created");
          refresh();
        },
        onError: (error) =>
          notify(error instanceof Error ? error.message : String(error), {
            type: "error",
          }),
      },
    );

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex flex-col gap-1 grow min-w-48">
        <Label htmlFor={`new-case-action-${serviceUserId}`}>
          {translate("resources.case_actions.new")}
        </Label>
        <Input
          id={`new-case-action-${serviceUserId}`}
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={translate("resources.case_actions.placeholder")}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`new-case-action-due-${serviceUserId}`}>
          {translate("resources.case_actions.fields.due_date")}
        </Label>
        <Input
          id={`new-case-action-due-${serviceUserId}`}
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={isPending || trimmed.length === 0}
      >
        {translate("resources.case_actions.add")}
      </Button>
    </form>
  );
};
