import { ROLE_LABEL } from "@/lib/domain/constants";
import { route } from "@/lib/server/http";

export const GET = route(async ({ actor }) => ({ id: actor.id, name: actor.name, role: actor.role, roleLabel: ROLE_LABEL[actor.role], regionId: actor.regionId }));
