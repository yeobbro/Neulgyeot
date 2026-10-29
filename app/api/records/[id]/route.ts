import { z } from "zod";
import { parseBody, route } from "@/lib/server/http";
import { deleteRecord, getRecord, updateRecord, updateRecordSchema } from "@/lib/server/services/records";

const del = z.object({ reason: z.string().trim().min(1, "삭제 사유를 입력하세요.").max(500) }).strict();

export const GET = route<{ id: string }>(async ({ db, actor, params }) => getRecord(db, actor, params.id));
export const PATCH = route<{ id: string }>(async ({ db, actor, params, req }) => updateRecord(db, actor, params.id, await parseBody(req, updateRecordSchema)));
export const DELETE = route<{ id: string }>(async ({ db, actor, params, req }) => {
  const { reason } = await parseBody(req, del);
  await deleteRecord(db, actor, params.id, reason);
  return { ok: true };
});
