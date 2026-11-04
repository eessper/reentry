import {
  CanAccess,
  ListBase,
  useListContext,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { SearchInput } from "@/components/admin/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { TopToolbar } from "../layout/TopToolbar";
import type { ServiceUser } from "../types";
import { RiskTierBadge } from "./RiskTierBadge";
import { ServiceUserListItem } from "./ServiceUserListItem";
import { StabilityDot } from "./StabilityDot";

const filters = [<SearchInput source="q" alwaysOn />];

const ServiceUserListActions = () => (
  <TopToolbar>
    <CanAccess resource="service_users" action="create">
      <CreateButton label="resources.service_users.create.title" />
    </CanAccess>
  </TopToolbar>
);

const StabilityCell = (_props: { label?: string }) => {
  const record = useRecordContext<ServiceUser>();
  return record ? (
    <StabilityDot stability={record.stability} showLabel />
  ) : null;
};

const RiskTierCell = (_props: { label?: string }) => {
  const record = useRecordContext<ServiceUser>();
  return record ? <RiskTierBadge tier={record.risk_tier} /> : null;
};

const ProgrammeDayCell = (_props: { label?: string }) => {
  const record = useRecordContext<ServiceUser>();
  const translate = useTranslate();
  return record
    ? translate("resources.service_users.day", { day: record.programme_day })
    : null;
};

export const ServiceUserList = () =>
  useIsMobile() ? <ServiceUserListMobile /> : <ServiceUserListDesktop />;

const ServiceUserListMobile = () => {
  const translate = useTranslate();
  return (
    <>
      <MobileHeader>
        <h1 className="text-xl font-semibold py-3">
          {translate("resources.service_users.name", { smart_count: 2 })}
        </h1>
      </MobileHeader>
      <MobileContent>
        <ListBase
          resource="service_users"
          sort={{ field: "programme_day", order: "ASC" }}
          perPage={200}
        >
          <ServiceUserItems />
        </ListBase>
      </MobileContent>
    </>
  );
};

const ServiceUserItems = () => {
  const translate = useTranslate();
  const { data, isPending } = useListContext<ServiceUser>();
  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {translate("resources.service_users.empty")}
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {data.map((serviceUser) => (
        <ServiceUserListItem key={serviceUser.id} serviceUser={serviceUser} />
      ))}
    </ul>
  );
};

const ServiceUserListDesktop = () => (
  <List
    filters={filters}
    actions={<ServiceUserListActions />}
    sort={{ field: "programme_day", order: "ASC" }}
    perPage={50}
  >
    <DataTable rowClick="show" bulkActionButtons={false}>
      <DataTable.Col
        label="resources.service_users.fields.stability"
        source="stability"
      >
        <StabilityCell />
      </DataTable.Col>
      <DataTable.Col source="display_name" />
      <DataTable.Col source="reference_code" />
      <DataTable.Col
        label="resources.service_users.fields.programme_day"
        source="programme_day"
      >
        <ProgrammeDayCell />
      </DataTable.Col>
      <DataTable.Col
        label="resources.service_users.fields.risk_tier"
        source="risk_tier"
      >
        <RiskTierCell />
      </DataTable.Col>
      <DataTable.Col source="assigned_worker_id">
        <ReferenceField
          source="assigned_worker_id"
          reference="sales"
          link={false}
        />
      </DataTable.Col>
      <DataTable.Col source="nb_open_escalations" />
      <DataTable.Col source="last_checkin_at">
        <DateField source="last_checkin_at" showTime />
      </DataTable.Col>
    </DataTable>
  </List>
);
