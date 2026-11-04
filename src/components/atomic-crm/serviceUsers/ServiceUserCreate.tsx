import { CreateBase, Form, useTranslate } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { FormToolbar } from "../layout/FormToolbar";
import { ServiceUserInputs } from "./ServiceUserInputs";

export const ServiceUserCreate = () => {
  const translate = useTranslate();
  return (
    <CreateBase redirect="show">
      <div className="max-w-lg w-full mx-auto mt-4">
        <Form>
          <Card>
            <CardContent className="flex flex-col gap-4">
              <h1 className="text-xl font-semibold">
                {translate("resources.service_users.create.title")}
              </h1>
              <ServiceUserInputs />
              <FormToolbar />
            </CardContent>
          </Card>
        </Form>
      </div>
    </CreateBase>
  );
};
