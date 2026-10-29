import { route } from "@/lib/server/http";
import { portalContext } from "@/lib/server/services/portal";

export const GET = route(async ({ db, actor }) => portalContext(db, actor));
