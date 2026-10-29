import { parseBody, route } from "@/lib/server/http";
import { reviewAssessment, reviewSchema } from "@/lib/server/services/assessments";

export const PATCH = route<{ id: string }>(async ({ db, actor, params, req }) => reviewAssessment(db, actor, params.id, await parseBody(req, reviewSchema)));
