import { json, parseBody, parseQuery, route } from "@/lib/server/http";
import { createRecipient, createRecipientSchema, listRecipients, recipientListQuery } from "@/lib/server/services/recipients";

export const GET = route(async ({ db, actor, req }) => listRecipients(db, actor, parseQuery(req, recipientListQuery)));
export const POST = route(async ({ db, actor, req }) => json(await createRecipient(db, actor, await parseBody(req, createRecipientSchema)), 201));
