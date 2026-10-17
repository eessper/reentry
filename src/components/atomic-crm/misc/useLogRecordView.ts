import { useEffect, useRef } from "react";
import { useDataProvider, type Identifier } from "ra-core";

import type { CrmDataProvider } from "../providers/types";

/**
 * Records in the audit log that the current user opened a record.
 * Logs once per record id, even when React runs effects twice in development.
 */
export const useLogRecordView = (
  tableName: "contacts",
  recordId: Identifier | undefined,
) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const loggedId = useRef<Identifier | undefined>(undefined);

  useEffect(() => {
    if (recordId == null || loggedId.current === recordId) return;
    loggedId.current = recordId;
    dataProvider.logRecordView(tableName, recordId).catch((error: unknown) => {
      console.error("Failed to log record view", error);
    });
  }, [dataProvider, tableName, recordId]);
};
