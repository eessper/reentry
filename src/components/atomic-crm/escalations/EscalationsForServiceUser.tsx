import { useGetList, useTranslate } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import type { Escalation, ServiceUser } from "../types";
import { EscalationCard } from "./EscalationCard";

/** A service user's unresolved escalations, on their profile. */
export const EscalationsForServiceUser = ({
  serviceUserId,
}: {
  serviceUserId: ServiceUser["id"];
}) => {
  const translate = useTranslate();
  const { data } = useGetList<Escalation>("escalations", {
    pagination: { page: 1, perPage: 20 },
    sort: { field: "opened_at", order: "DESC" },
    filter: { service_user_id: serviceUserId, "status@neq": "resolved" },
  });
  if (!data?.length) return null;
  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold mb-3">
          {translate("resources.escalations.name", { smart_count: 2 })}
        </h2>
        <ul className="flex flex-col gap-2">
          {data.map((escalation) => (
            <EscalationCard
              key={escalation.id}
              escalation={escalation}
              showServiceUser={false}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
