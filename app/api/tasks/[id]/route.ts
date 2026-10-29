import { parseBody, route } from "@/lib/server/http";
import { getTask, updateTask, updateTaskSchema } from "@/lib/server/services/tasks";

export const GET = route<{ id: string }>(async ({ db, actor, params }) => getTask(db, actor, params.id));
export const PATCH = route<{ id: string }>(async ({ db, actor, params, req }) => updateTask(db, actor, params.id, await parseBody(req, updateTaskSchema)));
