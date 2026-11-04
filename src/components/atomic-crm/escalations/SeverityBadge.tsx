import { useTranslate } from "ra-core";
import { Badge } from "@/components/ui/badge";

import type { EscalationSeverity } from "../types";

const SEVERITY_CLASSES: Record<EscalationSeverity, string> = {
  low: "border-sky-500/50",
  medium: "border-amber-400/70",
  high: "bg-red-500/15 border-red-500/70",
  critical: "bg-red-600 text-white border-red-600",
};

export const SeverityBadge = ({
  severity,
}: {
  severity: EscalationSeverity;
}) => {
  const translate = useTranslate();
  return (
    <Badge variant="outline" className={SEVERITY_CLASSES[severity]}>
      {translate(`resources.escalations.severities.${severity}`)}
    </Badge>
  );
};
