import { z } from "zod";
import { parseBody, route } from "@/lib/server/http";
import { setFamilyConsent } from "@/lib/server/services/portal";

const body = z.object({ consentStatus: z.enum(["granted", "revoked"]) }).strict();

export const PATCH = route<{ id: string }>(async ({ db, actor, params, req }) => {
  const { consentStatus } = await parseBody(req, body);
  await setFamilyConsent(db, actor, params.id, consentStatus);
  return { ok: true };
});
