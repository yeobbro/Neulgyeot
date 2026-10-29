import { z } from "zod";
import { parseBody, parseQuery, route } from "@/lib/server/http";
import { listNotifications, markNotificationsRead, syncTaskDueNotifications } from "@/lib/server/services/notifications";

const q = z.object({ unreadOnly: z.enum(["true", "false"]).optional() });
const body = z.object({ ids: z.union([z.array(z.string()).max(100), z.literal("all")]) }).strict();

export const GET = route(async ({ db, actor, req }) => {
  if (actor.role === "admin" || actor.role === "worker") await syncTaskDueNotifications(db);
  return listNotifications(db, actor, { unreadOnly: parseQuery(req, q).unreadOnly === "true" });
});
export const PATCH = route(async ({ db, actor, req }) => {
  await markNotificationsRead(db, actor, (await parseBody(req, body)).ids);
  return { ok: true };
});
