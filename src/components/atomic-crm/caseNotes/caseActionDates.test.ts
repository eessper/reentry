import { isOverdue } from "./caseActionDates";

describe("isOverdue", () => {
  const today = new Date(2026, 9, 21, 15, 30);

  it("is overdue when the due date is before today", () => {
    expect(isOverdue("2026-10-20", today)).toBe(true);
  });

  it("is not overdue on the due date itself", () => {
    expect(isOverdue("2026-10-21", today)).toBe(false);
  });

  it("is not overdue without a due date", () => {
    expect(isOverdue(null, today)).toBe(false);
  });
});
