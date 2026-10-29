import { z } from "zod";
import { parseQuery, route } from "@/lib/server/http";
import { portalSchedule } from "@/lib/server/services/portal";

const q = z.object({ recipientId: z.string().optional() });
export const GET = route(async ({ db, actor, req }) => portalSchedule(db, actor, parseQuery(req, q).recipientId));
