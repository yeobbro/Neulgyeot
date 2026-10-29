import { parseQuery, route } from "@/lib/server/http";
import { listServices, serviceListQuery } from "@/lib/server/services/care-services";

export const GET = route(async ({ db, actor, req }) => ({ data: await listServices(db, actor, parseQuery(req, serviceListQuery)) }));
