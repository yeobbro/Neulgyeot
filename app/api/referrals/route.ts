import { json, parseBody, parseQuery, route } from "@/lib/server/http";
import { createReferral, createReferralSchema, listReferrals, referralListQuery } from "@/lib/server/services/care-services";

export const GET = route(async ({ db, actor, req }) => listReferrals(db, actor, parseQuery(req, referralListQuery)));
export const POST = route(async ({ db, actor, req }) => json(await createReferral(db, actor, await parseBody(req, createReferralSchema)), 201));
