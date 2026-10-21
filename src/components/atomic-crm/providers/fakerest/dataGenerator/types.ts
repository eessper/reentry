import type {
  Company,
  Contact,
  ContactNote,
  ActivityEvent,
  Deal,
  DealNote,
  Escalation,
  Sale,
  ServiceUser,
  SupportProfile,
  Tag,
  Task,
} from "../../../types";
import type { ConfigurationContextValue } from "../../../root/ConfigurationContext";

export interface Db {
  companies: Company[];
  contacts: Contact[];
  contact_notes: ContactNote[];
  deals: Deal[];
  deal_notes: DealNote[];
  sales: Sale[];
  tags: Tag[];
  tasks: Task[];
  configuration: Array<{ id: number; config: ConfigurationContextValue }>;
  // Re-entry resources; the demo generator doesn't create them yet
  service_users?: ServiceUser[];
  support_profiles?: SupportProfile[];
  escalations?: Escalation[];
  activity_events?: ActivityEvent[];
}
