import { createDemoAuditLog } from "./demoAuditLog";

describe("createDemoAuditLog", () => {
  it("returns a person's history newest first, including their child records", () => {
    const log = createDemoAuditLog();
    log.record({
      action: "view",
      tableName: "service_users",
      recordId: 1,
      actorName: "Mo Rahman",
    });
    log.record({
      action: "create",
      tableName: "case_notes",
      recordId: 7,
      actorName: "Mo Rahman",
      after: { id: 7, service_user_id: 1, body: "Called" },
    });
    log.record({
      action: "create",
      tableName: "case_notes",
      recordId: 8,
      actorName: "Ellie Hughes",
      after: { id: 8, service_user_id: 2, body: "Someone else" },
    });

    const history = log.historyFor(1);

    expect(history.map((entry) => [entry.table_name, entry.action])).toEqual([
      ["case_notes", "create"],
      ["service_users", "view"],
    ]);
    expect(history[0].actor_name).toBe("Mo Rahman");
  });
});
