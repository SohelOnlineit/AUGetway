"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { plainText } from "@/lib/rich-html";

const BLOCKS = [
  { value: "p", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "pre", label: "Preformatted" },
] as const;

const INSERTS = [
  { value: "link", label: "Link" },
  { value: "image", label: "Image" },
  { value: "hr", label: "Horizontal line" },
] as const;

export function RichTextEditor({
  value,
  onChange,
  placeholder = "",
  maxLength,
  minHeight = "7.5rem",
  resizable = true,
  unlimited = false,
  className,
  onImageUpload,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number;
  minHeight?: string;
  resizable?: boolean;
  unlimited?: boolean;
  className?: string;
  onImageUpload?: (file: File) => Promise<string | null>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(() => plainText(value).length);
  const [expanded, setExpanded] = useState(false);
  const [color, setColor] = useState("#26bfb0");
  const [block, setBlock] = useState("p");
  const [uploading, setUploading] = useState(false);
  const height = expanded ? expandedHeight(minHeight) : minHeight;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.innerHTML === value) return;
    editor.innerHTML = value || "";
  }, [value]);

  function emit() {
    const editor = editorRef.current;
    if (!editor) return;
    let html = editor.innerHTML;
    if (maxLength && plainText(html).length > maxLength) {
      html = clipHtml(html, maxLength);
      editor.innerHTML = html;
    }
    const next = html === "<br>" ? "" : html;
    setCount(plainText(next).length);
    onChange(next);
  }

  function run(command: string, argument?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    emit();
  }

  function formatBlock(tag: string) {
    run("formatBlock", `<${tag}>`);
    setBlock(tag);
  }

  function readBlock() {
    const raw = String(document.queryCommandValue("formatBlock") || "")
      .replace(/[<>]/g, "")
      .toLowerCase();
    setBlock(BLOCKS.some((item) => item.value === raw) ? raw : "p");
  }

  function addLink() {
    const url = window.prompt("Link URL");
    if (url) run("createLink", url);
  }

  function addImage() {
    if (onImageUpload) {
      fileRef.current?.click();
      return;
    }
    const url = window.prompt("Image URL");
    if (url) run("insertImage", url);
  }

  async function upload(file: File) {
    if (!onImageUpload) return;
    setUploading(true);
    try {
      const url = await onImageUpload(file);
      if (url) run("insertImage", url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function insert(kind: string) {
    if (kind === "link") addLink();
    else if (kind === "image") addImage();
    else if (kind === "hr") run("insertHorizontalRule");
  }

  return (
    <div className={className ? `write-box ${className}` : "write-box"}>
      {onImageUpload ? (
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/svg+xml"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      ) : null}
      <div className="write-bar" role="toolbar" aria-label="Writing tools">
        <select aria-label="Text format" value={block} onChange={(event) => formatBlock(event.target.value)}>
          {BLOCKS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Insert"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) insert(event.target.value);
            event.currentTarget.value = "";
          }}
        >
          <option value="" disabled>
            Insert
          </option>
          {INSERTS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="write-split" />
        <Tool title="Bold" onPress={() => run("bold")}>
          <Mark>B</Mark>
        </Tool>
        <Tool title="Italic" onPress={() => run("italic")}>
          <Mark italic>I</Mark>
        </Tool>
        <Tool title="Text color" onPress={() => colorRef.current?.click()}>
          <span className="write-color" style={{ color }}>
            A
          </span>
        </Tool>
        <input
          ref={colorRef}
          className="write-color-input"
          type="color"
          value={color}
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            setColor(event.target.value);
            run("foreColor", event.target.value);
          }}
        />
        <span className="write-split" />
        <Tool title="Align left" onPress={() => run("justifyLeft")}>
          <Align lines={[16, 10, 14]} />
        </Tool>
        <Tool title="Align center" onPress={() => run("justifyCenter")}>
          <Align lines={[16, 10, 14]} center />
        </Tool>
        <Tool title="Align right" onPress={() => run("justifyRight")}>
          <Align lines={[16, 10, 14]} right />
        </Tool>
        <span className="write-split" />
        <Tool title="Bullet list" onPress={() => run("insertUnorderedList")}>
          <List ordered={false} />
        </Tool>
        <Tool title="Numbered list" onPress={() => run("insertOrderedList")}>
          <List ordered />
        </Tool>
        <Tool title="Quote" onPress={() => run("formatBlock", "<blockquote>")}>
          <Quote />
        </Tool>
        <Tool title="Insert link" onPress={addLink}>
          <LinkMark />
        </Tool>
        <Tool title="Insert image" disabled={uploading} onPress={addImage}>
          <ImageMark />
        </Tool>
        <Tool title="Undo" onPress={() => run("undo")}>
          <Undo />
        </Tool>
        {resizable ? (
          <>
            <span className="write-split" />
            <Tool
              title={expanded ? "Collapse editor" : "Expand editor"}
              pressed={expanded}
              onPress={() => setExpanded((open) => !open)}
            >
              <Expand open={expanded} />
            </Tool>
          </>
        ) : null}
      </div>
      <div
        ref={editorRef}
        className="write-area"
        contentEditable
        role="textbox"
        aria-multiline
        data-placeholder={placeholder}
        suppressContentEditableWarning
        style={{ minHeight: height }}
        onInput={emit}
        onBlur={emit}
        onKeyUp={readBlock}
        onMouseUp={readBlock}
      />
      <div className="write-foot">
        <span>
          {unlimited
            ? "Unlimited length. Drag the corner or use expand while writing."
            : "One line shows at first. Drag the corner or use expand to see the rest."}
        </span>
        {maxLength ? (
          <span>
            {count}/{maxLength}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Tool({
  title,
  pressed,
  disabled,
  onPress,
  children,
}: {
  title: string;
  pressed?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={pressed ? "is-on" : undefined}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onPress();
      }}
    >
      {children}
    </button>
  );
}

function Mark({ children, italic }: { children: string; italic?: boolean }) {
  return <span className={italic ? "write-italic" : "write-bold"}>{children}</span>;
}

function Align({
  lines,
  center,
  right,
}: {
  lines: number[];
  center?: boolean;
  right?: boolean;
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {lines.map((width, index) => {
        const x = right ? 20 - width : center ? (24 - width) / 2 : 4;
        return (
          <path
            key={index}
            d={`M${x} ${6 + index * 5}h${width}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function List({ ordered }: { ordered: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {[6, 12, 18].map((y, index) => (
        <g key={y}>
          {ordered ? (
            <text x="3" y={y + 1} fill="currentColor" fontSize="7">
              {index + 1}
            </text>
          ) : (
            <circle cx="5" cy={y} r="1.1" fill="currentColor" />
          )}
          <path
            d={`M10 ${y}h10`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}

function Quote() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 16c0-3 1.6-5.2 4-6.2V12c-.8.4-1.3 1-1.3 1.8H11V16H7Zm7 0c0-3 1.6-5.2 4-6.2V12c-.8.4-1.3 1-1.3 1.8H18V16h-4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LinkMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M10 14.2 8.4 15.8a3.2 3.2 0 0 1-4.5-4.5l2.4-2.4a3.2 3.2 0 0 1 4.5 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M14 9.8 15.6 8.2a3.2 3.2 0 0 1 4.5 4.5l-2.4 2.4a3.2 3.2 0 0 1-4.5 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ImageMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m7 15 3-3 2 2 3-3 2 2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function Undo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M8 8H5V5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 8a7 7 0 1 1-1 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Expand({ open }: { open: boolean }) {
  const d = open
    ? "M9 4H5v4M15 4h4v4M9 20H5v-4M15 20h4v-4"
    : "M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4";
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function expandedHeight(minHeight: string) {
  const match = /^(\d+(?:\.\d+)?)(rem|px)$/.exec(minHeight);
  if (!match) return "16rem";
  return `${Math.round(Number(match[1]) * 2.6)}${match[2]}`;
}

function clipHtml(html: string, maxLength: number) {
  const box = document.createElement("div");
  box.innerHTML = html;
  let used = 0;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const room = maxLength - used;
      if (text.length > room) {
        node.textContent = text.slice(0, room);
        used = maxLength;
        return true;
      }
      used += text.length;
      return used >= maxLength;
    }
    const children = [...node.childNodes];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child && walk(child)) {
        for (let next = index + 1; next < children.length; next += 1) children[next]?.remove();
        return true;
      }
    }
    return used >= maxLength;
  };
  walk(box);
  return box.innerHTML;
}
