import type {
  ActivityEvent,
  Escalation,
  ServiceUser,
  Stability,
} from "../../../types";

const MISSED_CHECKIN_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * The demo's copy of service_user_stability() (08_service_users.sql), so the
 * status dots react to escalations opened and resolved during a demo.
 */
export const demoStability = (
  serviceUser: Pick<ServiceUser, "id" | "risk_tier">,
  escalations: Escalation[],
  events: ActivityEvent[],
  now = Date.now(),
): Stability => {
  const open = escalations.filter(
    (escalation) =>
      escalation.service_user_id === serviceUser.id &&
      escalation.status !== "resolved",
  );
  if (open.some((e) => e.severity === "high" || e.severity === "critical")) {
    return "critical";
  }
  const recentlyMissed = events.some(
    (event) =>
      event.service_user_id === serviceUser.id &&
      event.type === "missed_checkin" &&
      now - new Date(event.created_at).getTime() <= MISSED_CHECKIN_WINDOW_MS,
  );
  return open.length > 0 || serviceUser.risk_tier === "high" || recentlyMissed
    ? "watch"
    : "stable";
};

/** Fills in the summary view's derived fields from the current records. */
export const withDerivedFields = (
  serviceUser: ServiceUser,
  escalations: Escalation[],
  events: ActivityEvent[],
): ServiceUser => ({
  ...serviceUser,
  nb_open_escalations: escalations.filter(
    (escalation) =>
      escalation.service_user_id === serviceUser.id &&
      escalation.status !== "resolved",
  ).length,
  stability: demoStability(serviceUser, escalations, events),
});
