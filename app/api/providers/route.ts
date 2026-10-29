import { z } from "zod";
import { SERVICE_TYPES } from "@/lib/domain/constants";
import { parseQuery, route } from "@/lib/server/http";
import { listProviders } from "@/lib/server/services/care-services";

const q = z.object({ regionId: z.string().optional(), serviceType: z.enum(SERVICE_TYPES).optional() });
export const GET = route(async ({ db, actor, req }) => ({ data: await listProviders(db, actor, parseQuery(req, q)) }));
