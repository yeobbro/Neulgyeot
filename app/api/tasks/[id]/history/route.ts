import { route } from "@/lib/server/http";
import { taskHistory } from "@/lib/server/services/tasks";

export const GET = route<{ id: string }>(async ({ db, actor, params }) => ({ data: await taskHistory(db, actor, params.id) }));
