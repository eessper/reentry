import { useQueryClient } from "@tanstack/react-query";
import {
  EditBase,
  Form,
  required,
  useGetList,
  useNotify,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { NumberInput } from "@/components/admin/number-input";
import { SaveButton } from "@/components/admin/form";
import { SelectInput } from "@/components/admin/select-input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { ServiceUser, SupportProfile } from "../types";
import {
  frequencyChoices,
  moduleChoices,
  pathwayChoices,
} from "./serviceUserChoices";
import { pickConfiguration } from "./serviceUserFields";

/**
 * The "Clinical Profile Configuration" form. Every save is a new version of
 * the profile, recorded in the audit trail with who made it.
 */
export const ProfileConfiguration = () => {
  const serviceUser = useRecordContext<ServiceUser>();
  const translate = useTranslate();
  const { data: profiles, isPending } = useGetList<SupportProfile>(
    "support_profiles",
    {
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
      filter: { service_user_id: serviceUser?.id },
    },
    { enabled: serviceUser != null },
  );
  const profile = profiles?.[0];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">
            {translate("resources.support_profiles.title")}
          </h2>
          {profile ? (
            <span className="text-xs text-muted-foreground">
              {translate("resources.support_profiles.version", {
                version: profile.version,
              })}
            </span>
          ) : null}
        </div>
        {isPending || !profile ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ProfileForm profile={profile} />
        )}
      </CardContent>
    </Card>
  );
};

const ProfileForm = ({ profile }: { profile: SupportProfile }) => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  return (
    <EditBase<SupportProfile>
      resource="support_profiles"
      id={profile.id}
      redirect={false}
      mutationMode="pessimistic"
      transform={pickConfiguration}
      mutationOptions={{
        onSuccess: () => {
          notify("resources.support_profiles.saved");
          queryClient.invalidateQueries({ queryKey: ["serviceUserHistory"] });
          queryClient.invalidateQueries({ queryKey: ["support_profiles"] });
        },
      }}
    >
      <Form className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectInput
            source="primary_risk_pathway"
            choices={pathwayChoices}
            helperText={false}
          />
          <SelectInput
            source="active_cbt_module"
            choices={moduleChoices}
            helperText={false}
          />
          <SelectInput
            source="checkin_frequency"
            choices={frequencyChoices}
            validate={required()}
            helperText={false}
          />
          <NumberInput
            source="sentiment_dip_days"
            min={1}
            max={14}
            validate={required()}
            helperText={false}
          />
          <NumberInput
            source="missed_checkins_threshold"
            min={1}
            max={10}
            validate={required()}
            helperText={false}
          />
          <NumberInput
            source="keyword_sensitivity"
            min={1}
            max={10}
            validate={required()}
            helperText={false}
          />
        </div>
        <div className="flex justify-end">
          <SaveButton />
        </div>
      </Form>
    </EditBase>
  );
};
