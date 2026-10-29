import { json, parseBody, rateLimit, route } from "@/lib/server/http";
import { generateReport, generateReportSchema } from "@/lib/server/services/reports";

export const POST = route(async ({ db, actor, req }) => {
  const input = await parseBody(req, generateReportSchema);
  rateLimit(`ai:${actor.id}`, 20, 60_000);
  return json(await generateReport(db, actor, input), 201);
});
