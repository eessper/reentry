import { formatDistanceToNow } from "date-fns";
import { RecordContextProvider, useGetList, useTranslate } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { ActivityEvent } from "../types";

/** The latest automated and human actions, newest first. */
export const ActivityFeed = ({
  serviceUserId,
  limit = 20,
}: {
  serviceUserId?: ActivityEvent["service_user_id"];
  limit?: number;
}) => {
  const translate = useTranslate();
  const { data, isPending } = useGetList<ActivityEvent>("activity_events", {
    pagination: { page: 1, perPage: limit },
    sort: { field: "created_at", order: "DESC" },
    filter: serviceUserId == null ? {} : { service_user_id: serviceUserId },
  });

  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold mb-3">
          {translate("crm.control_tower.activity")}
        </h2>
        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.activity_events.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((event) => (
              <RecordContextProvider key={event.id} value={event}>
                <li className="text-sm flex flex-wrap gap-x-2 items-baseline">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground w-28 shrink-0">
                    {translate(`resources.activity_events.types.${event.type}`)}
                  </span>
                  {serviceUserId == null ? (
                    <ReferenceField
                      source="service_user_id"
                      reference="service_users"
                      link="show"
                      className="font-medium"
                    />
                  ) : null}
                  <span className="grow">{event.summary}</span>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={event.created_at}
                  >
                    {formatDistanceToNow(new Date(event.created_at), {
                      addSuffix: true,
                    })}
                  </time>
                </li>
              </RecordContextProvider>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
