/** Largest compacted document state the server stores. */
export const MAX_STATE_BYTES = 512 * 1024;
/** Largest single sync update; also the body limit of a keepalive request. */
export const MAX_UPDATE_BYTES = 64 * 1024;
/** Request body limit for a sync: a base64 update plus its state vector. */
export const MAX_SYNC_BODY_BYTES = 96 * 1024;
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
