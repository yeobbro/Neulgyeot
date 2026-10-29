import { parseBody, rateLimit, route } from "@/lib/server/http";
import { structure, structureSchema } from "@/lib/server/services/voice";

export const POST = route(async ({ actor, req }) => {
  const { transcript } = await parseBody(req, structureSchema);
  rateLimit(`ai:${actor.id}`, 20, 60_000);
  return structure(actor, transcript);
});
