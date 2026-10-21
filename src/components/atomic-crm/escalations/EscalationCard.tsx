import { formatDistanceToNow } from "date-fns";
import { RecordContextProvider, useTranslate } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";

import type { Escalation } from "../types";
import { EscalationActions } from "./EscalationActions";
import { SeverityBadge } from "./SeverityBadge";

export const EscalationCard = ({
  escalation,
  showServiceUser = true,
}: {
  escalation: Escalation;
  showServiceUser?: boolean;
}) => {
  const translate = useTranslate();
  return (
    <RecordContextProvider value={escalation}>
      <li
        className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center"
        aria-label={translate(
          `resources.escalations.triggers.${escalation.trigger_type}`,
        )}
      >
        <div className="flex flex-col gap-1 grow">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={escalation.severity} />
            {showServiceUser ? (
              <ReferenceField
                source="service_user_id"
                reference="service_users"
                link="show"
                className="font-semibold"
              />
            ) : null}
            <span className="text-sm">
              {translate(
                `resources.escalations.triggers.${escalation.trigger_type}`,
              )}
            </span>
            <Badge variant="secondary">
              {translate(`resources.escalations.statuses.${escalation.status}`)}
            </Badge>
          </div>
          {escalation.notes ? (
            <p className="text-sm text-muted-foreground">{escalation.notes}</p>
          ) : null}
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
            <time dateTime={escalation.opened_at}>
              {translate("resources.escalations.fields.opened_at")}{" "}
              {formatDistanceToNow(new Date(escalation.opened_at), {
                addSuffix: true,
              })}
            </time>
            {escalation.assigned_to != null ? (
              <span>
                {translate("resources.escalations.fields.assigned_to")}{" "}
                <ReferenceField
                  source="assigned_to"
                  reference="sales"
                  link={false}
                />
              </span>
            ) : null}
          </div>
        </div>
        <EscalationActions escalation={escalation} />
      </li>
    </RecordContextProvider>
  );
};
