export const REPOSITORY_ERROR_CODES = [
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "EMAIL_TAKEN",
  "NOT_FOUND",
  "VALIDATION",
  "FORBIDDEN",
  "CONFLICT",
  "RATE_LIMITED",
  "NETWORK",
  "EMAIL_NOT_VERIFIED",
  "STORAGE",
  "AI_UNAVAILABLE",
  "AI_PROVIDER_ERROR",
  "AI_INVALID_OUTPUT",
  "AI_REFUSED",
  "AI_CANCELLED",
  "AI_TIMEOUT",
  "INVALID_FILE",
  "PDF_PAGE_LIMIT",
  "DOCUMENT_TOO_LONG",
  "EMPTY_DOCUMENT",
  "UPLOAD_MISSING",
  "STORAGE_UNAVAILABLE",
  "AI_CREDITS_EXCEEDED",
  "AI_GLOBAL_LIMIT",
  "AI_JOB_TOO_LARGE",
  "AI_BUSY",
  "OCR_PAGE_LIMIT",
  "USERNAME_TAKEN",
  "USERNAME_COOLDOWN",
  "UNKNOWN",
] as const;
export type RepositoryErrorCode = (typeof REPOSITORY_ERROR_CODES)[number];

/** Error shape shared by local (Phase 1) and HTTP (Phase 2) repositories. */
export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = "RepositoryError";
    this.code = code;
  }
}

export function toErrorCode(error: unknown): RepositoryErrorCode {
  if (error instanceof RepositoryError) return error.code;
  if (error instanceof Error && error.name === "StorageError") return "STORAGE";
  return "UNKNOWN";
}
