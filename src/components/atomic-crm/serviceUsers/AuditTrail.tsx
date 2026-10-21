import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History } from "lucide-react";
import { useDataProvider, useRecordContext, useTranslate } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { CrmDataProvider } from "../providers/types";
import type { AuditTrailEntry, ServiceUser } from "../types";
import { changedFields } from "./serviceUserFields";

/** The profile's "Configuration Audit Trail": who changed or opened what, when. */
export const AuditTrail = ({ isReady = true }: { isReady?: boolean }) => {
  const record = useRecordContext<ServiceUser>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const translate = useTranslate();
  const { data, isPending, isError } = useQuery({
    queryKey: ["serviceUserHistory", record?.id],
    queryFn: () => dataProvider.getServiceUserHistory(record!.id),
    enabled: record != null && isReady,
  });

  const fieldLabel = (entry: AuditTrailEntry, field: string) =>
    translate(`resources.${entry.table_name}.fields.${field}`, { _: field });

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-2 mb-3">
          <History className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {translate("crm.audit_trail.title")}
          </h2>
        </div>
        {isError ? (
          <p role="alert" className="text-sm text-destructive">
            {translate("crm.audit_trail.error")}
          </p>
        ) : isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">
            {translate("crm.audit_trail.empty")}
          </p>
        ) : (
          <ol className="flex flex-col gap-3 max-h-[480px] overflow-y-auto">
            {data.map((entry) => {
              const fields = changedFields(entry);
              return (
                <li key={entry.id} className="text-sm border-l-2 pl-3">
                  <div className="font-medium">
                    {translate(
                      `crm.audit_trail.events.${entry.table_name}.${entry.action}`,
                      { _: `${entry.table_name} ${entry.action}` },
                    )}
                  </div>
                  {fields.length ? (
                    <div className="text-muted-foreground">
                      {translate("crm.audit_trail.changed", {
                        fields: fields
                          .map((field) => fieldLabel(entry, field))
                          .join(", "),
                      })}
                    </div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    <time dateTime={entry.created_at}>
                      {format(new Date(entry.created_at), "d MMM yyyy, HH:mm")}
                    </time>{" "}
                    ·{" "}
                    {translate("crm.audit_trail.by", {
                      name: entry.actor_name,
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};
