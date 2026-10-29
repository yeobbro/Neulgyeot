import { json, parseBody, route } from "@/lib/server/http";
import { createDraft, createDraftSchema } from "@/lib/server/services/voice";

export const POST = route(async ({ db, actor, req }) => json(await createDraft(db, actor, await parseBody(req, createDraftSchema)), 201));
