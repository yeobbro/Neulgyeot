import { z } from "zod";
import { SERVICE_TYPES } from "@/lib/domain/constants";
import { parseBody, route } from "@/lib/server/http";
import { matchForRecipient } from "@/lib/server/services/care-services";

const body = z.object({ serviceTypes: z.array(z.enum(SERVICE_TYPES)).optional() }).strict();

export const POST = route<{ id: string }>(async ({ db, actor, params, req }) => {
  const { serviceTypes } = await parseBody(req, body);
  return matchForRecipient(db, actor, params.id, serviceTypes);
});
