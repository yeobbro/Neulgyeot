import { parseQuery, route } from "@/lib/server/http";
import { analyticsQuery, analyticsTrends } from "@/lib/server/services/analytics";

export const GET = route(async ({ db, actor, req }) => analyticsTrends(db, actor, parseQuery(req, analyticsQuery)));
