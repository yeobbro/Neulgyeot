import { route } from "@/lib/server/http";
import { getAssessment } from "@/lib/server/services/assessments";

export const GET = route<{ id: string }>(async ({ db, actor, params }) => getAssessment(db, actor, params.id));
