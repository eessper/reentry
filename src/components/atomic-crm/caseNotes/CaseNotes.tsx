import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { NotebookPen } from "lucide-react";
import {
  RecordContextProvider,
  useCreate,
  useGetList,
  useNotify,
  useTranslate,
} from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { CaseNote, ServiceUser } from "../types";

const MAX_NOTE_LENGTH = 5000;

/**
 * Case notes on a service user's profile, newest first. The database stamps
 * the author and logs every note in the audit trail.
 */
export const CaseNotes = ({
  serviceUserId,
}: {
  serviceUserId: ServiceUser["id"];
}) => {
  const translate = useTranslate();
  const { data } = useGetList<CaseNote>("case_notes", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "created_at", order: "DESC" },
    filter: { service_user_id: serviceUserId },
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {translate("resources.case_notes.name", { smart_count: 2 })}
          </h2>
        </div>
        <NewCaseNote serviceUserId={serviceUserId} />
        {!data?.length ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.case_notes.empty")}
          </p>
        ) : (
          <ol className="flex flex-col gap-3 max-h-[420px] overflow-y-auto">
            {data.map((note) => (
              <RecordContextProvider key={note.id} value={note}>
                <li className="text-sm border-l-2 pl-3">
                  <p className="whitespace-pre-wrap">{note.body}</p>
                  <div className="text-xs text-muted-foreground mt-1">
                    <ReferenceField
                      source="author_sales_id"
                      reference="sales"
                      link={false}
                      empty={translate("resources.case_notes.system")}
                    />{" "}
                    ·{" "}
                    <time dateTime={note.created_at}>
                      {formatDistanceToNow(new Date(note.created_at), {
                        addSuffix: true,
                      })}
                    </time>
                  </div>
                </li>
              </RecordContextProvider>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};

const NewCaseNote = ({
  serviceUserId,
}: {
  serviceUserId: ServiceUser["id"];
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [create, { isPending }] = useCreate<CaseNote>();
  const [body, setBody] = useState("");
  const trimmed = body.trim();

  const save = () =>
    create(
      "case_notes",
      { data: { service_user_id: serviceUserId, body: trimmed } },
      {
        onSuccess: () => {
          setBody("");
          notify("resources.case_notes.notifications.created");
          queryClient.invalidateQueries({ queryKey: ["case_notes"] });
          queryClient.invalidateQueries({ queryKey: ["serviceUserHistory"] });
        },
        onError: (error) =>
          notify(error instanceof Error ? error.message : String(error), {
            type: "error",
          }),
      },
    );

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Label htmlFor={`new-case-note-${serviceUserId}`}>
        {translate("resources.case_notes.new")}
      </Label>
      <Textarea
        id={`new-case-note-${serviceUserId}`}
        value={body}
        maxLength={MAX_NOTE_LENGTH}
        onChange={(event) => setBody(event.target.value)}
        placeholder={translate("resources.case_notes.placeholder")}
      />
      <div>
        <Button
          type="submit"
          size="sm"
          disabled={isPending || trimmed.length === 0}
        >
          {translate("resources.case_notes.add")}
        </Button>
      </div>
    </form>
  );
};
