import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDataProvider, type Identifier } from "ra-core";

import type { LoggedRecordTable } from "../providers/supabase/dataProvider";
import type { CrmDataProvider } from "../providers/types";

/**
 * Records in the audit log that the current user opened a record.
 * Logs once per record id, even when React runs effects twice in development.
 * The audit trail on the same page loads in parallel, so it is reloaded once
 * the view is recorded, to include it.
 */
export const useLogRecordView = (
  tableName: LoggedRecordTable,
  recordId: Identifier | undefined,
) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();
  const loggedId = useRef<Identifier | undefined>(undefined);

  useEffect(() => {
    if (recordId == null || loggedId.current === recordId) return;
    loggedId.current = recordId;
    dataProvider
      .logRecordView(tableName, recordId)
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["serviceUserHistory"] }),
      )
      .catch((error: unknown) => {
        console.error("Failed to log record view", error);
      });
  }, [dataProvider, queryClient, tableName, recordId]);
};
