import { ResponsiveBar } from "@nivo/bar";
import { format, parseISO } from "date-fns";
import { Activity } from "lucide-react";
import { useTranslate } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import type { StabilityDay } from "../types";

const KEYS = ["stable", "watch", "critical"] as const;
const COLORS = ["#10b981", "#fbbf24", "#ef4444"];

const axisStyle = {
  ticks: { text: { fill: "var(--color-muted-foreground)" } },
  legend: { text: { fill: "var(--color-muted-foreground)" } },
};

/** Stacked daily counts of stable, watch and critical service users. */
export const StabilityChart = ({ days }: { days: StabilityDay[] }) => {
  const translate = useTranslate();
  const data = days.map((day) => ({
    day: format(parseISO(day.day), "EEE d"),
    stable: day.stable,
    watch: day.watch,
    critical: day.critical,
  }));
  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-2 mb-2">
          <Activity className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {translate("crm.control_tower.stability_chart")}
          </h2>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground mb-2">
          {KEYS.map((key, index) => (
            <span key={key} className="inline-flex items-center gap-1">
              <span
                className="inline-block size-2.5 rounded-sm"
                style={{ backgroundColor: COLORS[index] }}
              />
              {translate(`resources.service_users.stability.${key}`)}
            </span>
          ))}
        </div>
        <div
          className="h-[260px]"
          role="img"
          aria-label={translate("crm.control_tower.stability_chart")}
        >
          <ResponsiveBar
            data={data}
            indexBy="day"
            keys={[...KEYS]}
            colors={COLORS}
            margin={{ top: 10, right: 10, bottom: 30, left: 30 }}
            padding={0.35}
            enableGridY
            enableLabel={false}
            axisBottom={{ tickSize: 0, tickPadding: 10, style: axisStyle }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 6,
              tickValues: 5,
              style: axisStyle,
            }}
            theme={{ grid: { line: { stroke: "var(--color-border)" } } }}
            tooltip={({ id, value, indexValue }) => (
              <div className="p-2 bg-secondary rounded shadow text-secondary-foreground text-sm">
                <strong>{indexValue}</strong>{" "}
                {translate(`resources.service_users.stability.${id}`)}: {value}
              </div>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
};
