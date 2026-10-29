import { route } from "@/lib/server/http";
import { listRegions } from "@/lib/server/services/regions";

export const GET = route(async ({ db }) => ({ data: await listRegions(db) }));
