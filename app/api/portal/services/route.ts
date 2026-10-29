import { z } from "zod";
import { parseQuery, route } from "@/lib/server/http";
import { portalServices } from "@/lib/server/services/portal";

const q = z.object({ recipientId: z.string().optional() });
export const GET = route(async ({ db, actor, req }) => portalServices(db, actor, parseQuery(req, q).recipientId));
