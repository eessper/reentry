import { useTranslate } from "ra-core";
import { Link } from "react-router";

import type { ServiceUser } from "../types";
import { StabilityDot } from "./StabilityDot";

/** One cohort row: status dot, name, reference and programme day. */
export const ServiceUserListItem = ({
  serviceUser,
}: {
  serviceUser: ServiceUser;
}) => {
  const translate = useTranslate();
  return (
    <li>
      <Link
        to={`/service_users/${serviceUser.id}/show`}
        className="flex items-center gap-3 py-2 hover:bg-accent/50 rounded px-1"
      >
        <StabilityDot stability={serviceUser.stability} />
        <span className="font-medium grow">{serviceUser.display_name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {serviceUser.reference_code}
        </span>
        <span className="text-xs text-muted-foreground w-14 text-right">
          {translate("resources.service_users.day", {
            day: serviceUser.programme_day,
          })}
        </span>
      </Link>
    </li>
  );
};
