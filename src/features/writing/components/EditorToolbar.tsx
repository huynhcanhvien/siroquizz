"use client";

import { Bold, BookmarkPlus, Eraser, Highlighter, Italic, Palette, Underline } from "lucide-react";
import { useTranslations } from "next-intl";
import type Quill from "quill";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { cn } from "@/lib/cn";

/** Theme tokens, so chosen colours stay readable in both light and dark mode. */
const TEXT_COLORS = [
  "var(--primary-text)",
  "var(--accent-text)",
  "var(--success)",
  "var(--danger)",
  "var(--text-muted)",
];
const HIGHLIGHTS = [
  "var(--primary-soft)",
  "var(--accent-soft)",
  "var(--success-soft)",
  "var(--danger-soft)",
  "var(--surface-3)",
];
type Formats = Record<string, unknown>;

function useFormats(quill: Quill | null): Formats {
  const [formats, setFormats] = useState<Formats>({});
  useEffect(() => {
    if (!quill) return;
    const update = () => setFormats(quill.getSelection() ? quill.getFormat() : {});
    quill.on("editor-change", update);
    return () => void quill.off("editor-change", update);
  }, [quill]);
  return formats;
}

function ToolButton(props: {
  label: string;
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
      className={cn(props.active && "bg-primary-soft text-primary-text")}
    >
      {props.children}
    </Button>
  );
}

function ColorMenu(props: {
  label: string;
  icon: ReactNode;
  colors: readonly string[];
  disabled: boolean;
  defaultLabel: string;
  onPick: (color: string | false) => void;
  swatch: "text" | "fill";
}) {
  return (
    <Menu>
      <MenuTrigger asChild disabled={props.disabled}>
        <Button variant="ghost" size="icon-sm" aria-label={props.label} title={props.label}>
          {props.icon}
        </Button>
      </MenuTrigger>
      <MenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
        <MenuItem onSelect={() => props.onPick(false)}>{props.defaultLabel}</MenuItem>
        <div className="grid grid-cols-5 gap-1 p-2">
          {props.colors.map((color) => (
            <MenuItem
              key={color}
              aria-label={color}
              onSelect={() => props.onPick(color)}
              className="size-7 justify-center rounded-md border border-border p-0"
              style={props.swatch === "text" ? { color } : { background: color }}
            >
              A
            </MenuItem>
          ))}
        </div>
      </MenuContent>
    </Menu>
  );
}

/** Formatting and "save word" controls for the writing editor. */
export function EditorToolbar({
  quill,
  readOnly,
  onSaveWord,
}: {
  quill: Quill | null;
  readOnly: boolean;
  onSaveWord: (term: string) => void;
}) {
  const t = useTranslations("writing.editor");
  const formats = useFormats(quill);
  const disabled = !quill || readOnly;
  const toggle = (name: string) => quill?.format(name, !formats[name], "user");
  const saveWord = () => {
    const range = quill?.getSelection();
    const term = range?.length ? quill!.getText(range.index, range.length).trim() : "";
    onSaveWord(term);
  };
  return (
    <div
      role="toolbar"
      aria-label={t("toolbar")}
      className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1.5"
    >
      <ToolButton
        label={t("bold")}
        active={Boolean(formats.bold)}
        disabled={disabled}
        onClick={() => toggle("bold")}
      >
        <Bold className="size-4" aria-hidden />
      </ToolButton>
      <ToolButton
        label={t("italic")}
        active={Boolean(formats.italic)}
        disabled={disabled}
        onClick={() => toggle("italic")}
      >
        <Italic className="size-4" aria-hidden />
      </ToolButton>
      <ToolButton
        label={t("underline")}
        active={Boolean(formats.underline)}
        disabled={disabled}
        onClick={() => toggle("underline")}
      >
        <Underline className="size-4" aria-hidden />
      </ToolButton>
      <ColorMenu
        label={t("color")}
        icon={<Palette className="size-4" aria-hidden />}
        colors={TEXT_COLORS}
        swatch="text"
        disabled={disabled}
        defaultLabel={t("defaultColor")}
        onPick={(color) => quill?.format("color", color, "user")}
      />
      <ColorMenu
        label={t("highlight")}
        icon={<Highlighter className="size-4" aria-hidden />}
        colors={HIGHLIGHTS}
        swatch="fill"
        disabled={disabled}
        defaultLabel={t("defaultColor")}
        onPick={(color) => quill?.format("background", color, "user")}
      />
      <ToolButton
        label={t("clear")}
        disabled={disabled}
        onClick={() => {
          const range = quill?.getSelection();
          if (range)
            for (const name of ["bold", "italic", "underline", "color", "background"])
              quill!.formatText(range.index, range.length, name, false, "user");
        }}
      >
        <Eraser className="size-4" aria-hidden />
      </ToolButton>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden />
      <Button
        variant="soft"
        size="sm"
        disabled={!quill}
        onMouseDown={(event) => event.preventDefault()}
        onClick={saveWord}
      >
        <BookmarkPlus className="size-4" aria-hidden />
        {t("saveWord")}
      </Button>
    </div>
  );
}
