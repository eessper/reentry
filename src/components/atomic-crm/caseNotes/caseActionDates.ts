/**
 * Whether an action due on `dueDate` (a `YYYY-MM-DD` date) is overdue on
 * `today`. An action due today is not overdue yet.
 */
export const isOverdue = (dueDate: string | null, today: Date): boolean => {
  if (!dueDate) return false;
  const todayIso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return dueDate < todayIso;
};
