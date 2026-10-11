/** Content budget shared by browser extraction and server generation. */
export const MAX_DOCUMENT_TOKENS = 100_000;
/** Upload bounds protect memory; document length is checked after extraction. */
export const MAX_DOCUMENT_FILES = 100;
export const MAX_DOCUMENT_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_UPLOAD_BYTES = 200 * 1024 * 1024;
