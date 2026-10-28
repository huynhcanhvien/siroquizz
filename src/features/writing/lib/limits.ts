/** Largest compacted document state the server stores. */
export const MAX_STATE_BYTES = 512 * 1024;
/** Largest update a keepalive request (sent while the page closes) may carry. */
export const MAX_UPDATE_BYTES = 64 * 1024;
/** Largest single sync update: a long paste (about 80k Vietnamese characters) fits. */
export const MAX_SYNC_UPDATE_BYTES = 256 * 1024;
/** Request body limit for a sync: a base64 update plus its state vector. */
export const MAX_SYNC_BODY_BYTES = 384 * 1024;
/** Pastes larger than this are refused in the editor with a message (never half-saved). */
export const MAX_PASTE_BYTES = 128 * 1024;
/** Scratch cards one person can keep before turning them into a set. */
export const MAX_SCRATCH = 300;
export const MAX_SESSIONS_PER_CLASS = 100;
export const PREVIEW_CHARS = 300;
export const MAX_PROMPT_CHARS = 5000;
export const MAX_TITLE_CHARS = 120;
/** Characters after which the editor warns that the document is getting long. */
export const SOFT_CHAR_LIMIT = 20_000;
/** Closed sessions are deleted this long after they closed. */
export const CLOSED_SESSION_RETENTION_MS = 180 * 86400_000;
