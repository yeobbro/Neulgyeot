import { z } from "zod";
import { json, parseBody, rateLimit, route } from "@/lib/server/http";
import { listRecipientAssessments, runAssessment } from "@/lib/server/services/assessments";

const body = z.object({ useAi: z.boolean().default(false) }).strict();

export const GET = route<{ id: string }>(async ({ db, actor, params }) => ({ data: await listRecipientAssessments(db, actor, params.id) }));
export const POST = route<{ id: string }>(async ({ db, actor, params, req }) => {
  const { useAi } = await parseBody(req, body);
  if (useAi) rateLimit(`ai:${actor.id}`, 20, 60_000);
  return json(await runAssessment(db, actor, params.id, { useAi }), 201);
});
