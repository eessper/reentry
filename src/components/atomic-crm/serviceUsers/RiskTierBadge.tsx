import { useTranslate } from "ra-core";
import { Badge } from "@/components/ui/badge";

import type { RiskTier } from "../types";

const TIER_CLASSES: Record<RiskTier, string> = {
  low: "border-emerald-500/50",
  moderate: "border-sky-500/50",
  moderate_high: "border-amber-500/60",
  high: "border-red-500/70",
};

export const RiskTierBadge = ({ tier }: { tier: RiskTier }) => {
  const translate = useTranslate();
  return (
    <Badge variant="outline" className={TIER_CLASSES[tier]}>
      {translate(`resources.service_users.risk_tiers.${tier}`)}
    </Badge>
  );
};
