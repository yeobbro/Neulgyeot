import { route } from "@/lib/server/http";
import { listRecipients, recipientListQuery } from "@/lib/server/services/recipients";
import { listRegions } from "@/lib/server/services/regions";

/** Aggregated coverage gaps for the synthetic demo map. Counts are derived from the same
 * recipient filters used by the case list; no real geographic boundaries are implied. */
export const GET = route(async ({ db, actor }) => {
  const regions = await listRegions(db);
  const recipients = await listRecipients(db, actor, recipientListQuery.parse({ page: 1, pageSize: 100, sort: "code_asc" }));
  const dongs = regions
    .filter((region) => region.level === "eupmyeondong")
    .map((region) => {
      const inRegion = recipients.data.filter((recipient) => recipient.regionId === region.id);
      return {
        regionId: region.id,
        regionName: region.name,
        recipients: inRegion.length,
        unconnected: inRegion.filter((recipient) => recipient.unconnected).length,
        isDemoData: region.isDemoData,
      };
    })
    .filter((region) => region.recipients > 0);
  return { dongs, isDemoData: true, note: "시연용 가상 데이터 기반의 지역별 서비스 연계 현황입니다." };
});
