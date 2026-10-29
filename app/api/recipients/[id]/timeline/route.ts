import { route } from "@/lib/server/http";
import { recipientTimeline } from "@/lib/server/services/timeline";

export const GET = route<{ id: string }>(async ({ db, actor, params }) => ({ data: await recipientTimeline(db, actor, params.id) }));
