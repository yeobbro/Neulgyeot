import { parseQuery, route } from "@/lib/server/http";
import { assessmentListQuery, listAssessments } from "@/lib/server/services/assessments";

export const GET = route(async ({ db, actor, req }) => listAssessments(db, actor, parseQuery(req, assessmentListQuery)));
