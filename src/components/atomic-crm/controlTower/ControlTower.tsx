import { useQuery } from "@tanstack/react-query";
import { useDataProvider, useTranslate } from "ra-core";
import { EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { useCurrentRole } from "../misc/useCurrentRole";
import type { CrmDataProvider } from "../providers/types";
import { ActivityFeed } from "./ActivityFeed";
import { CohortPanel } from "./CohortPanel";
import { KpiCards } from "./KpiCards";
import { StabilityChart } from "./StabilityChart";

/**
 * The landing page. KPIs and the stability chart are aggregates every role
 * sees; the cohort and activity feed are individual records, so viewers don't
 * get them (the database would return nothing for them anyway).
 */
export const ControlTower = () => {
  const isMobile = useIsMobile();
  const translate = useTranslate();
  const content = <ControlTowerContent />;
  if (!isMobile) {
    return (
      <div className="flex flex-col gap-4 mt-1">
        <h1 className="text-2xl font-semibold">
          {translate("crm.control_tower.title")}
        </h1>
        {content}
      </div>
    );
  }
  return (
    <>
      <MobileHeader showRefresh>
        <h1 className="text-xl font-semibold py-3">
          {translate("crm.control_tower.title")}
        </h1>
      </MobileHeader>
      <MobileContent>{content}</MobileContent>
    </>
  );
};

const ControlTowerContent = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const translate = useTranslate();
  const role = useCurrentRole();
  const { data: stats, isError } = useQuery({
    queryKey: ["controlTowerStats"],
    queryFn: () => dataProvider.getControlTowerStats(),
  });
  const isViewer = role === "viewer";

  return (
    <div className="flex flex-col gap-4">
      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {translate("crm.control_tower.error")}
        </p>
      ) : !stats ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <KpiCards stats={stats} />
      )}
      {isViewer ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <EyeOff className="size-4" />
          {translate("crm.control_tower.viewer_notice")}
        </p>
      ) : null}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className={isViewer ? "lg:col-span-12" : "lg:col-span-7"}>
          {stats ? <StabilityChart days={stats.stability} /> : null}
        </div>
        {role && !isViewer ? (
          <div className="lg:col-span-5">
            <CohortPanel />
          </div>
        ) : null}
      </div>
      {role && !isViewer ? <ActivityFeed /> : null}
    </div>
  );
};
