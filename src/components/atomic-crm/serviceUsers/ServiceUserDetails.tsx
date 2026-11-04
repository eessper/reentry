import { EditBase, Form, useRecordContext, useTranslate } from "ra-core";
import { SaveButton } from "@/components/admin/form";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { Card, CardContent } from "@/components/ui/card";

import { seesAllRecords, useCurrentRole } from "../misc/useCurrentRole";
import type { ServiceUser } from "../types";
import {
  consentChoices,
  riskTierChoices,
  statusChoices,
} from "./serviceUserChoices";
import { pickEditableFields } from "./serviceUserFields";

export const ServiceUserDetails = () => {
  const record = useRecordContext<ServiceUser>();
  const translate = useTranslate();
  const canAssign = seesAllRecords(useCurrentRole());
  if (!record) return null;

  return (
    <Card>
      <CardContent>
        <EditBase<ServiceUser>
          resource="service_users"
          id={record.id}
          redirect={false}
          mutationMode="pessimistic"
          transform={(values) => pickEditableFields(values, canAssign)}
        >
          <Form className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">
              {translate("resources.service_users.details_title")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ReferenceInput source="assigned_worker_id" reference="sales">
                <SelectInput
                  label={translate(
                    "resources.service_users.fields.assigned_worker_id",
                  )}
                  readOnly={!canAssign}
                  helperText={false}
                />
              </ReferenceInput>
              <SelectInput
                source="risk_tier"
                choices={riskTierChoices}
                helperText={false}
              />
              <SelectInput
                source="status"
                choices={statusChoices}
                helperText={false}
              />
              <SelectInput
                source="consent_status"
                choices={consentChoices}
                helperText={false}
              />
            </div>
            <div className="flex justify-end">
              <SaveButton />
            </div>
          </Form>
        </EditBase>
      </CardContent>
    </Card>
  );
};
