// Compile-time check that the conversation rules shared with edge functions
// (supabase/functions/_shared/conversation/types.ts) use exactly the app's
// unions. A value added to one and not the other fails `make typecheck`.
import type * as Shared from "../../../../supabase/functions/_shared/conversation/types.ts";
import type {
  ActivityEventType,
  CbtModule,
  EscalationSeverity,
} from "../types";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type SharedTypesMatchTheApp = [
  Assert<Same<Shared.EscalationSeverity, EscalationSeverity>>,
  Assert<Same<Shared.ActivityEventType, ActivityEventType>>,
  Assert<Same<Shared.CbtModule, CbtModule>>,
];
