import type {
  ActivityEvent,
  CaseAction,
  CaseNote,
  Escalation,
  Sale,
  ServiceUser,
  SupportProfile,
} from "../../../types";
import type { ConfigurationContextValue } from "../../../root/ConfigurationContext";

export interface Db {
  sales: Sale[];
  service_users: ServiceUser[];
  support_profiles: SupportProfile[];
  escalations: Escalation[];
  activity_events: ActivityEvent[];
  case_notes: CaseNote[];
  case_actions: CaseAction[];
  configuration: Array<{ id: number; config: ConfigurationContextValue }>;
}
