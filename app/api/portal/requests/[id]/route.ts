import { parseBody, route } from "@/lib/server/http";
import { updateRequestSchema, updateSupportRequest } from "@/lib/server/services/portal";

/** Staff-side status change and answer for a resident/family request. */
export const PATCH = route<{ id: string }>(async ({ db, actor, params, req }) => updateSupportRequest(db, actor, params.id, await parseBody(req, updateRequestSchema)));
