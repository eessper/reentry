import { useEffect, useRef, useState } from "react";
import { useDataProvider, type Identifier } from "ra-core";

import type { LoggedRecordTable } from "../providers/supabase/dataProvider";
import type { CrmDataProvider } from "../providers/types";

/**
 * Records in the audit log that the current user opened a record.
 * Logs once per record id, even when React runs effects twice in development.
 *
 * Returns whether the attempt has finished (logged or failed), so a panel
 * showing the record's history can wait for it and include this view.
 */
export const useLogRecordView = (
  tableName: LoggedRecordTable,
  recordId: Identifier | undefined,
): boolean => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const loggedId = useRef<Identifier | undefined>(undefined);
  const [settledId, setSettledId] = useState<Identifier | undefined>(undefined);

  useEffect(() => {
    if (recordId == null || loggedId.current === recordId) return;
    loggedId.current = recordId;
    dataProvider
      .logRecordView(tableName, recordId)
      .catch((error: unknown) => {
        console.error("Failed to log record view", error);
      })
      .finally(() => setSettledId(recordId));
  }, [dataProvider, tableName, recordId]);

  return recordId != null && settledId === recordId;
};
