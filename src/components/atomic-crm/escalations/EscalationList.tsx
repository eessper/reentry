import { ListBase, useListContext, useTranslate } from "ra-core";
import { ListPagination } from "@/components/admin/list-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import type { Escalation } from "../types";
import { EscalationCard } from "./EscalationCard";

const NEEDS_ATTENTION = { "status@neq": "resolved" };
const RESOLVED = { status: "resolved" };

/** The escalation queue: what still needs a human first, oldest first. */
export const EscalationList = () => {
  const isMobile = useIsMobile();
  const translate = useTranslate();
  const queue = (
    <ListBase
      resource="escalations"
      filterDefaultValues={NEEDS_ATTENTION}
      sort={{ field: "opened_at", order: "ASC" }}
      perPage={50}
    >
      <EscalationQueue />
    </ListBase>
  );
  if (!isMobile) {
    return (
      <div className="flex flex-col gap-4 mt-2">
        <h1 className="text-2xl font-semibold">
          {translate("resources.escalations.queue.title")}
        </h1>
        {queue}
      </div>
    );
  }
  return (
    <>
      <MobileHeader>
        <h1 className="text-xl font-semibold py-3">
          {translate("resources.escalations.queue.title")}
        </h1>
      </MobileHeader>
      <MobileContent>{queue}</MobileContent>
    </>
  );
};

const EscalationQueue = () => {
  const translate = useTranslate();
  const { data, isPending, filterValues, setFilters } =
    useListContext<Escalation>();
  const tab = filterValues.status === "resolved" ? "resolved" : "open";

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setFilters(value === "resolved" ? RESOLVED : NEEDS_ATTENTION, {})
        }
      >
        <TabsList>
          <TabsTrigger value="open">
            {translate("resources.escalations.queue.needs_attention")}
          </TabsTrigger>
          <TabsTrigger value="resolved">
            {translate("resources.escalations.queue.resolved")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.escalations.queue.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((escalation) => (
            <EscalationCard key={escalation.id} escalation={escalation} />
          ))}
        </ul>
      )}
      <ListPagination />
    </div>
  );
};
