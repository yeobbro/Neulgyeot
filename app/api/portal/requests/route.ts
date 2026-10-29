import { json, parseBody, route } from "@/lib/server/http";
import { createPortalRequest, listPortalRequests, portalRequestSchema } from "@/lib/server/services/portal";

export const GET = route(async ({ db, actor }) => listPortalRequests(db, actor));
export const POST = route(async ({ db, actor, req }) => json(await createPortalRequest(db, actor, await parseBody(req, portalRequestSchema)), 201));
