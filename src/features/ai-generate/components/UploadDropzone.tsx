"use client";

import { FileImage, FileText, FileUp, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ACCEPT_ATTRIBUTE, validateFiles, type FileError } from "../lib/file-validation";

interface UploadDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
}

function FileIcon({ file }: { file: File }) {
  const Icon = file.type.startsWith("image/") ? FileImage : FileText;
  return <Icon className="size-5 shrink-0 text-primary" aria-hidden />;
}

export function UploadDropzone({ files, onChange }: UploadDropzoneProps) {
  const t = useTranslations("ai");
  const format = useFormatter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<FileError[]>([]);

  const addFiles = (incoming: File[]) => {
    const result = validateFiles(files, incoming);
    setErrors(result.errors);
    if (result.accepted.length > 0) onChange([...files, ...result.accepted]);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary-soft" : "border-border-strong bg-surface-2/60",
        )}
      >
        <span
          className={cn(
            "grid size-14 place-items-center rounded-2xl bg-surface shadow-sm transition-transform",
            dragging && "scale-110",
          )}
        >
          <FileUp className="size-7 text-primary" aria-hidden />
        </span>
        <p className="font-bold">{t("dropTitle")}</p>
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          {t("browse")}
        </Button>
        <p className="max-w-sm text-xs text-muted">{t("dropHint")}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-label={t("browse")}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      {errors.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-sm font-medium text-danger">
          {errors.map((error) => (
            <li key={`${error.code}-${error.name}`}>
              {error.code === "tooMany"
                ? t("fileError.tooMany")
                : t(`fileError.${error.code}`, { name: error.name })}
            </li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm"
            >
              <FileIcon file={file} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{file.name}</span>
                <span className="block text-xs text-muted">
                  {format.number(file.size / 1024, { maximumFractionDigits: 0 })} KB
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={t("removeFile", { name: file.name })}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
