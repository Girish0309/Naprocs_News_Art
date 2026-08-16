"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import { Bold, Italic, Link2, Quote, List, ListOrdered, Heading2, Heading3 } from "lucide-react";

export interface ArticleEditorValue {
  html: string;
  json: object;
}

interface ArticleEditorProps {
  initialContent?: string | object;
  onChange?: (value: ArticleEditorValue) => void;
  editable?: boolean;
  /** Rendered on the right side of the sticky toolbar — e.g. the autosave indicator. */
  toolbarRightSlot?: React.ReactNode;
  /** Rendered above the rich text content, inside the same scroll container (the title input). */
  titleSlot?: React.ReactNode;
  /** Rendered between titleSlot and the rich text content (the excerpt input). */
  excerptSlot?: React.ReactNode;
  /** Fires once the Tiptap instance exists, so a parent (the excerpt field's Enter
   * handler) can imperatively focus into the body — the editor instance otherwise
   * never leaves this component. */
  onEditorReady?: (editor: Editor) => void;
}

function ToolbarButton({
  onClick,
  isActive,
  title,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      onClick={onClick}
      className={`rounded p-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-admin-primary ${
        isActive
          ? "bg-admin-surface-container-low text-admin-primary"
          : "text-admin-on-surface-variant hover:bg-admin-surface-container-low hover:text-admin-primary"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, rightSlot }: { editor: Editor | null; rightSlot?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-admin-surface-bright px-lg py-sm">
      <div className="flex items-center gap-sm text-admin-on-surface-variant">
        <ToolbarButton title="Heading 2" isActive={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Heading 3" isActive={editor?.isActive("heading", { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-sm h-4 w-px bg-admin-outline-variant" />
        <ToolbarButton title="Bold" isActive={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic" isActive={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-sm h-4 w-px bg-admin-outline-variant" />
        <ToolbarButton title="Bullet list" isActive={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" isActive={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          isActive={editor?.isActive("link")}
          onClick={() => {
            const url = window.prompt("URL");
            if (url) {
              editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            } else {
              editor?.chain().focus().unsetLink().run();
            }
          }}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Quote" isActive={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
      </div>
      {rightSlot}
    </header>
  );
}

export default function ArticleEditor({
  initialContent = "",
  onChange,
  editable = true,
  toolbarRightSlot,
  titleSlot,
  excerptSlot,
  onEditorReady,
}: ArticleEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
    ],
    content: initialContent,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange?.({ html: editor.getHTML(), json: editor.getJSON() });
    },
  });

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  useEffect(() => {
    if (editor) onEditorReady?.(editor);
    // onEditorReady is expected to just stash the instance in a ref (see ArticleForm),
    // so re-running this if the parent re-renders with a new inline callback identity
    // is harmless — `editor` itself (Tiptap's own stable instance) is the real guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <div className="flex h-full flex-col">
      <Toolbar editor={editor} rightSlot={toolbarRightSlot} />
      <div className="no-scrollbar flex flex-1 justify-center overflow-y-auto px-lg py-lg md:px-xl">
        <div className="flex w-full max-w-[680px] flex-col gap-lg pb-xl">
          {titleSlot}
          {excerptSlot}
          <EditorContent
            editor={editor}
            className="font-article-body text-admin-article-body text-admin-primary-container [&_.ProseMirror]:min-h-[512px] [&_.ProseMirror]:outline-none [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-admin-outline-variant [&_.ProseMirror_blockquote]:pl-md [&_.ProseMirror_p]:mb-md"
          />
        </div>
      </div>
    </div>
  );
}
