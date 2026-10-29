import { route } from "@/lib/server/http";
import { getReport } from "@/lib/server/services/reports";

export const GET = route<{ id: string }>(async ({ db, actor, params }) => getReport(db, actor, params.id));
