import {
  MAX_DOCUMENT_FILES,
  MAX_DOCUMENT_FILE_BYTES,
  MAX_DOCUMENT_UPLOAD_BYTES,
} from "./document-limits";
export const MAX_FILES = MAX_DOCUMENT_FILES;
export const MAX_FILE_BYTES = MAX_DOCUMENT_FILE_BYTES;

/**
 * Extension → MIME types we accept. An empty MIME (common for .md) is tolerated.
 * A Map (not a plain object) so names like "x.constructor" cannot hit prototype keys.
 */
const ACCEPTED = new Map<string, readonly string[]>(
  Object.entries({
    pdf: ["application/pdf"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    txt: ["text/plain"],
    md: ["text/markdown", "text/x-markdown", "text/plain"],
    csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
    png: ["image/png"],
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    webp: ["image/webp"],
  }),
);

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv"]);

export const ACCEPT_ATTRIBUTE = [...ACCEPTED.keys()].map((extension) => `.${extension}`).join(",");

export type FileErrorCode = "unsupported" | "tooLarge" | "empty" | "tooMany" | "totalTooLarge";

export interface FileError {
  code: FileErrorCode;
  name: string;
}

export interface FileValidationResult {
  accepted: File[];
  errors: FileError[];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Use the extension when browsers omit MIME metadata for supported files. */
export function getFileMime(file: File): string {
  return file.type || ACCEPTED.get(extensionOf(file.name))?.[0] || "application/octet-stream";
}

function checkFile(file: File): FileErrorCode | null {
  const allowedTypes = ACCEPTED.get(extensionOf(file.name));
  if (!allowedTypes || (file.type !== "" && !allowedTypes.includes(file.type)))
    return "unsupported";
  if (file.size === 0) return "empty";
  if (file.size > MAX_FILE_BYTES) return "tooLarge";
  return null;
}

const fileKey = (file: File) => `${file.name}:${file.size}`;

/** Validates newly dropped files against type, size, count and duplicates. */
export function validateFiles(
  existing: readonly File[],
  incoming: readonly File[],
): FileValidationResult {
  const seen = new Set(existing.map(fileKey));
  return incoming.reduce<FileValidationResult>(
    (result, file) => {
      if (seen.has(fileKey(file))) return result;
      const code =
        checkFile(file) ??
        (existing.length + result.accepted.length >= MAX_FILES ? "tooMany" : null) ??
        (existing.reduce((sum, item) => sum + item.size, 0) +
          result.accepted.reduce((sum, item) => sum + item.size, 0) +
          file.size >
        MAX_DOCUMENT_UPLOAD_BYTES
          ? "totalTooLarge"
          : null);
      if (code) return { ...result, errors: [...result.errors, { code, name: file.name }] };
      seen.add(fileKey(file));
      return { ...result, accepted: [...result.accepted, file] };
    },
    { accepted: [], errors: [] },
  );
}

export function isTextFile(file: File): boolean {
  return TEXT_EXTENSIONS.has(extensionOf(file.name));
}
