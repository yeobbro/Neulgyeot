import { parseBody, route } from "@/lib/server/http";
import { getDraft, updateDraft, updateDraftSchema } from "@/lib/server/services/voice";

export const GET = route<{ id: string }>(async ({ db, actor, params }) => getDraft(db, actor, params.id));
export const PATCH = route<{ id: string }>(async ({ db, actor, params, req }) => updateDraft(db, actor, params.id, await parseBody(req, updateDraftSchema)));
