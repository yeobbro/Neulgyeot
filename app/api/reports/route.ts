import { route } from "@/lib/server/http";
import { listReports } from "@/lib/server/services/reports";

export const GET = route(async ({ db, actor }) => ({ data: await listReports(db, actor) }));
