import { useTranslate } from "ra-core";

import type { Stability } from "../types";

const DOT_CLASSES: Record<Stability, string> = {
  stable: "bg-emerald-500",
  watch: "bg-amber-400",
  critical: "bg-red-500 animate-pulse",
};

/** The cohort status dot, with its label for screen readers (or shown). */
export const StabilityDot = ({
  stability,
  showLabel = false,
}: {
  stability: Stability;
  showLabel?: boolean;
}) => {
  const translate = useTranslate();
  const label = translate(`resources.service_users.stability.${stability}`);
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span
        aria-hidden
        className={`inline-block size-2.5 rounded-full ${DOT_CLASSES[stability]}`}
      />
      <span className={showLabel ? "text-sm" : "sr-only"}>{label}</span>
    </span>
  );
};
