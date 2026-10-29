import { json, parseBody, parseQuery, route } from "@/lib/server/http";
import { createTask, createTaskSchema, listTasks, taskListQuery } from "@/lib/server/services/tasks";

export const GET = route(async ({ db, actor, req }) => listTasks(db, actor, parseQuery(req, taskListQuery)));
export const POST = route(async ({ db, actor, req }) => json(await createTask(db, actor, await parseBody(req, createTaskSchema)), 201));
