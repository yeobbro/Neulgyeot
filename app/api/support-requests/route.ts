import { parseQuery, route } from "@/lib/server/http";
import { listStaffRequests, staffRequestListQuery } from "@/lib/server/services/portal";

export const GET = route(async ({ db, actor, req }) => listStaffRequests(db, actor, parseQuery(req, staffRequestListQuery)));
