import { createCrmDb } from "@/test/StoryWrapper";
import type { SupportProfile } from "../../types";
import { createDataProvider } from "./dataProvider";

const profile: SupportProfile = {
  id: 1,
  service_user_id: 1,
  primary_risk_pathway: null,
  active_cbt_module: null,
  checkin_frequency: "daily",
  sentiment_dip_days: 3,
  missed_checkins_threshold: 2,
  keyword_sensitivity: 5,
  version: 1,
  updated_at: "2026-10-20T09:00:00.000Z",
  updated_by: null,
};

describe("demo data provider", () => {
  it("makes every profile save a new version, stamped with who saved it", async () => {
    const dataProvider = createDataProvider({
      db: createCrmDb({ support_profiles: [profile] }),
      latency: 0,
      silent: true,
      authProvider: {
        getIdentity: async () => ({ id: 3, fullName: "Mo Rahman" }),
      },
    });

    const { data } = await dataProvider.update<SupportProfile>(
      "support_profiles",
      {
        id: 1,
        data: { active_cbt_module: "urge_surfing", version: 1 },
        previousData: profile,
      },
    );

    expect(data).toMatchObject({
      active_cbt_module: "urge_surfing",
      version: 2,
      updated_by: 3,
    });
  });
});
