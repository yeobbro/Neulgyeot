import { parseBody, route } from "@/lib/server/http";
import { getRecipientSummary, updateRecipient, updateRecipientSchema } from "@/lib/server/services/recipients";

export const GET = route<{ id: string }>(async ({ db, actor, params }) => getRecipientSummary(db, actor, params.id));
export const PATCH = route<{ id: string }>(async ({ db, actor, params, req }) => updateRecipient(db, actor, params.id, await parseBody(req, updateRecipientSchema)));
