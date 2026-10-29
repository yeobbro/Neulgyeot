import { z } from "zod";
import { parseBody, route } from "@/lib/server/http";
import { getPreferences, setPreferences } from "@/lib/server/services/notifications";

const body = z.object({ inApp: z.boolean(), scheduleReminders: z.boolean(), requestUpdates: z.boolean() }).strict();

export const GET = route(async ({ db, actor }) => getPreferences(db, actor));
export const PUT = route(async ({ db, actor, req }) => setPreferences(db, actor, await parseBody(req, body)));
