import { z } from "zod";
import { RECORD_FLAGS, RECORD_TYPES, SERVICE_TYPES } from "../../domain/constants";
import { draftToRecordContent, type StructuredDraft } from "../../domain/voice-structure";
import { structureTranscript } from "../ai/structure";
import { audit } from "../audit";
import { assertRecipientAccess, requireRole } from "../auth/permissions";
import type { Actor } from "../auth/session";
import type { Db } from "../db/client";
import { nextId } from "../db/ids";
import { conflict, forbidden, notFound } from "../errors";
import { createRecord } from "./records";

export const structuredDraftSchema = z.object({
  summary: z.string().max(600),
  observations: z.array(z.string().max(400)).max(30),
  requestedSupport: z.array(z.string().max(400)).max(30),
  checkItems: z.array(z.string().max(400)).max(30),
  followUps: z.array(z.string().max(400)).max(30),
  serviceTypes: z.array(z.enum(SERVICE_TYPES)),
});

export const structureSchema = z.object({ transcript: z.string().trim().min(1, "변환된 텍스트가 없습니다.").max(8000) }).strict();

export async function structure(actor: Actor, transcript: string) {
  requireRole(actor, ["admin", "worker"]);
  return structureTranscript(transcript);
}

export const createDraftSchema = z
  .object({
    recipientId: z.string().min(1),
    recordType: z.enum(RECORD_TYPES),
    transcript: z.string().trim().min(1).max(8000),
    transcriptSource: z.enum(["browser_speech", "typed"]),
    structuredContent: structuredDraftSchema.nullable().optional(),
    structuringMethod: z.enum(["ai", "rules"]).nullable().optional(),
  })
  .strict();

export async function createDraft(db: Db, actor: Actor, input: z.infer<typeof createDraftSchema>) {
  requireRole(actor, ["admin", "worker"]);
  await assertRecipientAccess(db, actor, input.recipientId);
  const id = await nextId(db, "VD");
  await db.query(
    `INSERT INTO voice_record_drafts (id, recipient_id, created_by, record_type, transcript, transcript_source, structured_content, structuring_method)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, input.recipientId, actor.id, input.recordType, input.transcript, input.transcriptSource, input.structuredContent ? JSON.stringify(input.structuredContent) : null, input.structuringMethod ?? null],
  );
  return getDraft(db, actor, id);
}

export async function getDraft(db: Db, actor: Actor, id: string) {
  requireRole(actor, ["admin", "worker"]);
  const [d] = await db.query<{
    id: string;
    recipient_id: string;
    created_by: string;
    record_type: string;
    transcript: string;
    transcript_source: string;
    structured_content: StructuredDraft | null;
    structuring_method: string | null;
    review_status: string;
    saved_record_id: string | null;
    created_at: Date;
  }>(`SELECT * FROM voice_record_drafts WHERE id = $1`, [id]);
  if (!d) throw notFound("기록 초안");
  if (d.created_by !== actor.id && actor.role !== "admin") throw notFound("기록 초안");
  return {
    id: d.id,
    recipientId: d.recipient_id,
    recordType: d.record_type,
    transcript: d.transcript,
    transcriptSource: d.transcript_source,
    structuredContent: d.structured_content,
    structuringMethod: d.structuring_method,
    reviewStatus: d.review_status,
    savedRecordId: d.saved_record_id,
    createdAt: d.created_at.toISOString(),
  };
}

export const updateDraftSchema = z
  .object({
    transcript: z.string().trim().min(1).max(8000).optional(),
    structuredContent: structuredDraftSchema.nullable().optional(),
    recordType: z.enum(RECORD_TYPES).optional(),
    /** "save" turns the reviewed draft into an official record; "discard" drops it. */
    action: z.enum(["update", "save", "discard"]).default("update"),
    flags: z.array(z.enum(RECORD_FLAGS)).default([]),
    reviewedByStaff: z.boolean().optional(),
  })
  .strict();

export async function updateDraft(db: Db, actor: Actor, id: string, input: z.infer<typeof updateDraftSchema>) {
  const draft = await getDraft(db, actor, id);
  if (draft.reviewStatus !== "draft") throw conflict("이미 저장되었거나 폐기된 초안입니다.");
  if (input.action === "save" && input.reviewedByStaff !== true) throw forbidden("담당자 검토 확인 후 저장할 수 있습니다.");
  await db.query(
    `UPDATE voice_record_drafts SET transcript = COALESCE($2, transcript), structured_content = COALESCE($3, structured_content),
       record_type = COALESCE($4, record_type), updated_at = now() WHERE id = $1`,
    [id, input.transcript ?? null, input.structuredContent ? JSON.stringify(input.structuredContent) : null, input.recordType ?? null],
  );
  if (input.action === "discard") {
    await db.query(`UPDATE voice_record_drafts SET review_status = 'discarded', transcript = '', updated_at = now() WHERE id = $1`, [id]);
    await audit(db, { actorId: actor.id, action: "voice_draft.discarded", entityType: "voice_draft", entityId: id, recipientId: draft.recipientId });
    return getDraft(db, actor, id);
  }
  if (input.action === "save") {
    const latest = await getDraft(db, actor, id);
    const content = latest.structuredContent ? draftToRecordContent(latest.structuredContent) : latest.transcript;
    const record = await createRecord(db, actor, latest.recipientId, {
      recordType: latest.recordType as (typeof RECORD_TYPES)[number],
      visitStatus: latest.recordType === "visit" ? "completed" : null,
      content,
      flags: input.flags,
      sourceType: "voice",
    });
    await db.query(`UPDATE voice_record_drafts SET review_status = 'saved', saved_record_id = $2, updated_at = now() WHERE id = $1`, [id, record.id]);
    await audit(db, { actorId: actor.id, action: "voice_draft.saved", entityType: "voice_draft", entityId: id, recipientId: latest.recipientId, metadata: { recordId: record.id } });
  }
  return getDraft(db, actor, id);
}
