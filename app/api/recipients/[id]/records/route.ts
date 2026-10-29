import { z } from "zod";
import { RECORD_TYPES } from "@/lib/domain/constants";
import { json, parseBody, parseQuery, route } from "@/lib/server/http";
import { createRecord, createRecordSchema, listRecords } from "@/lib/server/services/records";

const q = z.object({ recordType: z.enum(RECORD_TYPES).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

export const GET = route<{ id: string }>(async ({ db, actor, params, req }) => ({ data: await listRecords(db, actor, params.id, parseQuery(req, q)) }));
export const POST = route<{ id: string }>(async ({ db, actor, params, req }) => json(await createRecord(db, actor, params.id, await parseBody(req, createRecordSchema)), 201));
