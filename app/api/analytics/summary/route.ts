import { parseQuery, route } from "@/lib/server/http";
import { analyticsQuery, analyticsSummary } from "@/lib/server/services/analytics";

export const GET = route(async ({ db, actor, req }) => analyticsSummary(db, actor, parseQuery(req, analyticsQuery)));
