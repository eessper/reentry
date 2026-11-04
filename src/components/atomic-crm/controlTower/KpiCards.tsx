import { useTranslate } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import type { ControlTowerStats } from "../types";

const Kpi = ({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "alert";
}) => (
  <Card className="py-4">
    <CardContent className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-3xl font-semibold tabular-nums ${tone === "alert" ? "text-red-500" : ""}`}
      >
        {value}
      </span>
      {detail ? (
        <span className="text-xs text-muted-foreground">{detail}</span>
      ) : null}
    </CardContent>
  </Card>
);

export const KpiCards = ({ stats }: { stats: ControlTowerStats }) => {
  const translate = useTranslate();
  const scope = translate(`crm.control_tower.kpi.${stats.scope}`);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Kpi
        label={translate("crm.control_tower.kpi.active_clients")}
        value={String(stats.active_clients)}
        detail={scope}
      />
      <Kpi
        label={translate("crm.control_tower.kpi.checkin_adherence")}
        value={
          stats.checkin_adherence == null ? "–" : `${stats.checkin_adherence}%`
        }
        detail={
          stats.checkin_adherence == null
            ? translate("crm.control_tower.kpi.no_checkins")
            : `${stats.checkins_completed} / ${stats.checkins_completed + stats.checkins_missed}`
        }
      />
      <Kpi
        label={translate("crm.control_tower.kpi.open_escalations")}
        value={String(stats.open_escalations)}
        detail={translate("crm.control_tower.kpi.urgent", {
          count: stats.urgent_escalations,
        })}
        tone={stats.urgent_escalations > 0 ? "alert" : "default"}
      />
    </div>
  );
};
