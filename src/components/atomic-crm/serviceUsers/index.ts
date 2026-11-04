import type { ServiceUser } from "../types";
import { ServiceUserCreate } from "./ServiceUserCreate";
import { ServiceUserList } from "./ServiceUserList";
import { ServiceUserShow } from "./ServiceUserShow";

export default {
  list: ServiceUserList,
  show: ServiceUserShow,
  create: ServiceUserCreate,
  recordRepresentation: (record: ServiceUser) =>
    `${record.display_name} (${record.reference_code})`,
};
