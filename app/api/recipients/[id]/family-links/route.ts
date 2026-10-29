import { route } from "@/lib/server/http";
import { listFamilyLinks } from "@/lib/server/services/portal";

export const GET = route<{ id: string }>(async ({ db, actor, params }) => ({ data: await listFamilyLinks(db, actor, params.id) }));
