import { useGetList, useTranslate } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ServiceUserListItem } from "../serviceUsers/ServiceUserListItem";
import type { ServiceUser, Stability } from "../types";

const STABILITY_ORDER: Record<Stability, number> = {
  critical: 0,
  watch: 1,
  stable: 2,
};

/** The caller's cohort, most urgent first. */
export const CohortPanel = () => {
  const translate = useTranslate();
  const { data, isPending } = useGetList<ServiceUser>("service_users", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "programme_day", order: "ASC" },
    filter: { "status@neq": "exited" },
  });
  const cohort = [...(data ?? [])].sort(
    (a, b) => STABILITY_ORDER[a.stability] - STABILITY_ORDER[b.stability],
  );

  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold mb-3">
          {translate("crm.control_tower.cohort")}
        </h2>
        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : cohort.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.service_users.empty")}
          </p>
        ) : (
          <ul className="divide-y max-h-[320px] overflow-y-auto">
            {cohort.map((serviceUser) => (
              <ServiceUserListItem
                key={serviceUser.id}
                serviceUser={serviceUser}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
