import { required, useTranslate } from "ra-core";
import { DateInput } from "@/components/admin/date-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import { riskTierChoices } from "./serviceUserChoices";
import { validateReferenceCode } from "./serviceUserFields";

/** The fields needed to add someone; the profile is configured afterwards. */
export const ServiceUserInputs = () => {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4">
      <TextInput
        source="display_name"
        validate={required()}
        helperText={false}
      />
      <TextInput
        source="reference_code"
        validate={[required(), validateReferenceCode]}
        helperText="RE-12345"
      />
      <DateInput
        source="release_date"
        validate={required()}
        helperText={false}
      />
      <SelectInput
        source="risk_tier"
        choices={riskTierChoices}
        defaultValue="moderate"
        validate={required()}
        helperText={false}
      />
      <ReferenceInput source="assigned_worker_id" reference="sales">
        <SelectInput
          label={translate("resources.service_users.fields.assigned_worker_id")}
          helperText={false}
        />
      </ReferenceInput>
    </div>
  );
};
