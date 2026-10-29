export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "rate_limited"
  | "not_implemented"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 400,
  conflict: 409,
  rate_limited: 429,
  not_implemented: 501,
  internal_error: 500,
};

/** Errors that are safe to show to the client. Messages must not contain personal data. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (what = "대상") => new AppError("not_found", `${what}을(를) 찾을 수 없습니다.`);
export const forbidden = (message = "이 작업을 할 권한이 없습니다.") => new AppError("forbidden", message);
export const invalid = (message: string, details?: unknown) => new AppError("validation_error", message, details);
export const conflict = (message: string) => new AppError("conflict", message);
