import { ShowBase, useShowContext, useTranslate } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

import { ActivityFeed } from "../controlTower/ActivityFeed";
import { EscalationsForServiceUser } from "../escalations/EscalationsForServiceUser";
import { MobileBackButton } from "../misc/MobileBackButton";
import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { useLogRecordView } from "../misc/useLogRecordView";
import type { ServiceUser } from "../types";
import { AuditTrail } from "./AuditTrail";
import { ProfileConfiguration } from "./ProfileConfiguration";
import { RiskTierBadge } from "./RiskTierBadge";
import { ServiceUserDetails } from "./ServiceUserDetails";
import { StabilityDot } from "./StabilityDot";

export const ServiceUserShow = () => (
  <ShowBase>
    <ServiceUserShowContent />
  </ShowBase>
);

const ServiceUserShowContent = () => {
  const { record, isPending } = useShowContext<ServiceUser>();
  const isMobile = useIsMobile();
  // The audit trail waits for this view to be logged, so it lists it
  const isViewLogged = useLogRecordView("service_users", record?.id);

  if (isPending || !record) {
    return <Skeleton className="h-64 w-full mt-4" />;
  }

  const body = (
    <div className="flex flex-col gap-4">
      <ServiceUserHeader record={record} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 flex flex-col gap-4">
          <ProfileConfiguration />
          <ServiceUserDetails />
          <EscalationsForServiceUser serviceUserId={record.id} />
        </div>
        <div className="lg:col-span-5 flex flex-col gap-4">
          <AuditTrail isReady={isViewLogged} />
          <ActivityFeed serviceUserId={record.id} limit={10} />
        </div>
      </div>
    </div>
  );

  if (!isMobile) {
    return <div className="mt-2">{body}</div>;
  }
  return (
    <>
      <MobileHeader>
        <MobileBackButton />
        <h1 className="text-lg font-semibold truncate py-3">
          {record.display_name}
        </h1>
      </MobileHeader>
      <MobileContent>{body}</MobileContent>
    </>
  );
};

const ServiceUserHeader = ({ record }: { record: ServiceUser }) => {
  const translate = useTranslate();
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold">{record.display_name}</h1>
          <span className="text-sm text-muted-foreground tabular-nums">
            {record.reference_code}
          </span>
        </div>
        <StabilityDot stability={record.stability} showLabel />
        <span className="text-sm">
          {translate("resources.service_users.day", {
            day: record.programme_day,
          })}
        </span>
        <RiskTierBadge tier={record.risk_tier} />
        <Badge variant="outline">
          {translate(
            `resources.service_users.consent.${record.consent_status}`,
          )}
        </Badge>
        {record.status !== "active" ? (
          <Badge variant="secondary">
            {translate(`resources.service_users.statuses.${record.status}`)}
          </Badge>
        ) : null}
        <span className="text-sm text-muted-foreground">
          {translate("resources.service_users.fields.assigned_worker_id")}:{" "}
          <ReferenceField
            source="assigned_worker_id"
            reference="sales"
            link={false}
            empty="–"
          />
        </span>
      </CardContent>
    </Card>
  );
};
