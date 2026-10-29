import { parseBody, route } from "@/lib/server/http";
import { getReferral, updateReferral, updateReferralSchema } from "@/lib/server/services/care-services";

export const GET = route<{ id: string }>(async ({ db, actor, params }) => getReferral(db, actor, params.id));
export const PATCH = route<{ id: string }>(async ({ db, actor, params, req }) => updateReferral(db, actor, params.id, await parseBody(req, updateReferralSchema)));
