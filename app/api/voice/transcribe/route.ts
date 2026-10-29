import { requireRole } from "@/lib/server/auth/permissions";
import { AppError } from "@/lib/server/errors";
import { route } from "@/lib/server/http";

/**
 * Server-side speech-to-text is not configured: no STT provider is integrated,
 * and audio is never uploaded. Clients use the browser Speech API or typed input.
 */
export const POST = route(async ({ actor }) => {
  requireRole(actor, ["admin", "worker"]);
  throw new AppError("not_implemented", "서버 음성 인식은 설정되어 있지 않습니다. 브라우저 음성 인식 또는 직접 입력을 이용하세요.");
});
