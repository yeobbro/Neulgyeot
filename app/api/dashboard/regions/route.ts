import { parseQuery, route } from "@/lib/server/http";
import { analyticsQuery, mapCoverage } from "@/lib/server/services/analytics";

export const GET = route(async ({ db, actor, req }) => {
  const c = await mapCoverage(db, actor, parseQuery(req, analyticsQuery));
  return { period: c.period, data: c.districts, isDemoData: c.isDemoData };
});
