"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import type { Editor } from "@tiptap/react";
import ArticleEditor, { type ArticleEditorValue } from "./ArticleEditor";
import CoverImageUploader, { type CoverImageValue } from "./CoverImageUploader";

const AUTOSAVE_INTERVAL_MS = 30_000;

type CoverImage = CoverImageValue;

interface ArticleFormProps {
  articleId?: string;
  initialTitle?: string;
  initialExcerpt?: string;
  initialContent?: string | object;
  initialTags?: string[];
  initialAuthorName: string;
  initialCoverImage?: CoverImage | null;
  initialStatus?: "draft" | "published";
  initialUpdatedAt?: string;
  initialSlug?: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "published" | "error";

function formatLastModified(value: string | null): string {
  if (!value) return "Not saved yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ArticleForm({
  articleId,
  initialTitle = "",
  initialExcerpt = "",
  initialContent = "",
  initialTags = [],
  initialAuthorName,
  initialCoverImage = null,
  initialStatus = "draft",
  initialUpdatedAt,
  initialSlug,
}: ArticleFormProps) {
  const router = useRouter();
  const [currentId, setCurrentId] = useState<string | undefined>(articleId);
  const [title, setTitle] = useState(initialTitle);
  const [excerpt, setExcerpt] = useState(initialExcerpt);
  const [tagsInput, setTagsInput] = useState(initialTags.join(", "));
  const [authorName, setAuthorName] = useState(initialAuthorName);
  const [coverImage, setCoverImage] = useState<CoverImage | null>(initialCoverImage);
  const [altText, setAltText] = useState(initialCoverImage?.alt_text ?? "");
  const [status, setStatus] = useState<"draft" | "published">(initialStatus);
  const [slug, setSlug] = useState<string | undefined>(initialSlug);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt ?? null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [checkmarkKey, setCheckmarkKey] = useState(0);

  const contentRef = useRef<ArticleEditorValue>({ html: "", json: {} });
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const isMountedRef = useRef(true);
  // Title -> Excerpt -> Body keyboard flow (see the Ghost/Notion/Medium research in
  // this feature's own writeup): the excerpt input is a plain DOM ref (focus() is
  // synchronous and immediate), but the body is a Tiptap instance living inside
  // ArticleEditor, which only ever hands its editor object out via onEditorReady —
  // there's no ref-forwardable DOM node for "the editor" the way there is for a plain
  // input.
  const excerptInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  function handleTitleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      excerptInputRef.current?.focus();
    }
  }

  function handleExcerptKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      editorRef.current?.commands.focus("start");
    }
  }
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // Relative path is enough — the public site is same-origin, and Link/target="_blank"
  // resolve it to the correct absolute URL without needing window.location.
  const publicUrl = status === "published" && slug ? `/articles/${slug}` : null;

  const save = useCallback(
    async (overrides?: { status?: "draft" | "published" }) => {
      if (!title.trim() || savingRef.current) return;
      savingRef.current = true;
      // Cleared *before* the snapshot below (not after the request resolves) — any
      // edit that lands while this request is in flight calls markDirty() again, so
      // clearing here means we only ever discard the flag for content this exact
      // request is about to send, never for edits that happen during the round trip.
      dirtyRef.current = false;
      setSaveStatus("saving");
      setErrorMessage(null);

      const payload = {
        title: title.trim(),
        excerpt: excerpt.trim(),
        author_name: authorName.trim() || "Unknown",
        body_html: contentRef.current.html,
        body_json: contentRef.current.json,
        tags: tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        ...(coverImage ? { cover_image: { ...coverImage, alt_text: altText.trim() || undefined } } : {}),
        ...(overrides?.status ? { status: overrides.status } : {}),
      };

      try {
        let response: Response;
        if (!currentId) {
          response = await fetch("/api/admin/articles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else {
          response = await fetch(`/api/admin/articles/${currentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(typeof data?.error === "string" ? data.error : "Save failed");
        }

        // A save triggered by the unmount-cleanup below (navigating away while
        // dirty) can still be in flight once the component is actually gone — the
        // write itself already landed at this point (that's what matters), but
        // there's no UI left to update, and redirecting a page the user has already
        // navigated away FROM back to the new article's edit page would be an
        // actively confusing surprise, not a helpful one. Found live: fixing the
        // stale-closure bug below (saveRef) meant this success branch started
        // actually running from the unmount path for the first time, exposing this.
        if (!isMountedRef.current) return;

        const newId: string | undefined = data.article?.id;
        if (newId && !currentId) {
          setCurrentId(newId);
          router.replace(`/admin/articles/${newId}/edit`);
        }
        if (data.article?.updated_at) setUpdatedAt(data.article.updated_at);
        if (data.article?.status) setStatus(data.article.status);
        if (data.article?.slug) setSlug(data.article.slug);

        setSaveStatus(overrides?.status === "published" ? "published" : "saved");
        setCheckmarkKey((key) => key + 1);
      } catch (error) {
        if (!isMountedRef.current) return;
        // The save didn't actually land — re-flag dirty (it was cleared optimistically
        // above) so the next autosave interval retries, matching the message below.
        dirtyRef.current = true;
        setSaveStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Couldn't save. Retrying on the next autosave.");
      } finally {
        savingRef.current = false;
      }
    },
    [title, excerpt, authorName, tagsInput, coverImage, altText, currentId, router]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (dirtyRef.current) void save();
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [save]);

  // Keeps a ref pointed at the latest `save` closure on every render — cheap, and
  // this effect has no cleanup, so re-running it on every keystroke (save changes
  // whenever its own deps do) is harmless, unlike the mount/unmount effect below.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Save once more on unmount if there are unsaved changes (e.g. navigating away).
  // Deliberately `[]` so this runs its cleanup exactly once, at true unmount — but
  // that means the cleanup closure below must never reference `save` directly: with
  // an empty dep array, React keeps the very first render's closure for the entire
  // component lifetime, so a brand-new article (title === "" at mount) would call a
  // permanently-stale `save` whose own closed-over `title` is still "", tripping its
  // `if (!title.trim()) return;` guard and silently discarding whatever was actually
  // typed — confirmed live: navigating away right after typing lost the draft
  // entirely, while waiting for the interval-based autosave (which correctly reruns
  // via its own `[save]` dependency) saved it correctly. Reading `saveRef.current`
  // here instead calls whatever `save` is current at the moment of unmount, not the
  // one from mount.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) void saveRef.current();
    };
  }, []);

  async function handlePublish() {
    if (coverImage && !altText.trim()) {
      setErrorMessage("Add alt text for the cover image before publishing.");
      return;
    }
    setIsPublishing(true);
    await save({ status: "published" });
    window.setTimeout(() => setIsPublishing(false), 600);
  }

  const autosaveIndicator = (
    <div className="flex items-center gap-xs font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant fade-transition">
      <span>
        {saveStatus === "saving" && "Saving..."}
        {saveStatus === "saved" && "Saved"}
        {saveStatus === "published" && "Published"}
        {saveStatus === "error" && "Couldn't save"}
        {saveStatus === "idle" && (status === "published" ? "Published" : "Draft")}
      </span>
      {(saveStatus === "saved" || saveStatus === "published") && (
        <svg
          key={checkmarkKey}
          className="checkmark-draw h-4 w-4 text-admin-primary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      )}
      {publicUrl && (
        <Link
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-admin-primary underline underline-offset-2 hover:text-admin-on-surface-variant"
        >
          View live <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );

  return (
    // Split-pane-with-independent-scroll only makes sense side-by-side (md:flex-row) —
    // below md this stacks (flex-col), and forcing h-full/overflow-hidden on both
    // stacked panes at once would fight over height with nowhere to go. Below md the
    // whole page scrolls normally instead (overflow-y-auto); at md+ each pane regains
    // its own independent scroll exactly as before (Module 12 responsive fix).
    <main className="flex h-full flex-1 flex-col overflow-y-auto bg-admin-background md:flex-row md:overflow-hidden">
      {/* min-w-0 on both this pane and the aside below: at md:flex-row these are two
          real flex siblings sharing width via percentages (md:w-3/4 / md:w-1/4), and
          flex items default to min-width: auto (their own content's intrinsic width as
          a floor) — without min-w-0, sufficiently wide unbreakable content in either
          pane (a long unhyphenated filename in the dropzone, an unbroken title/tag) can
          refuse to shrink to its allotted share, forcing this row wider than its
          parent. Not the cause of the specific 256px overflow just fixed in
          AdminShell.tsx (that was the parent wrapper's own width, one level up) — this
          is the same F2 pattern applied defensively so this row's own math can't
          reintroduce a similar overflow independently. */}
      <div className="relative flex w-full min-w-0 flex-col border-r border-hairline md:h-full md:w-3/4 md:overflow-hidden">
        <ArticleEditor
          initialContent={initialContent}
          onChange={(value) => {
            contentRef.current = value;
            markDirty();
          }}
          onEditorReady={(editor) => {
            editorRef.current = editor;
          }}
          toolbarRightSlot={autosaveIndicator}
          titleSlot={
            <input
              id="article-title"
              type="text"
              aria-label="Article title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                markDirty();
              }}
              onKeyDown={handleTitleKeyDown}
              placeholder="Article Title"
              className="mt-lg w-full border-0 border-b-2 border-transparent bg-transparent p-0 font-display-lg text-admin-display-lg text-admin-primary outline-none transition-colors duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.1)] placeholder:text-admin-outline-variant focus:border-admin-primary focus:ring-0"
            />
          }
          excerptSlot={
            <input
              id="article-excerpt"
              ref={excerptInputRef}
              type="text"
              aria-label="Article excerpt"
              value={excerpt}
              onChange={(event) => {
                setExcerpt(event.target.value);
                markDirty();
              }}
              onKeyDown={handleExcerptKeyDown}
              placeholder="Add a short excerpt (optional) — press Enter to start writing"
              className="w-full border-0 border-b-2 border-transparent bg-transparent p-0 font-headline-md text-admin-headline-md text-admin-secondary outline-none transition-colors duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.1)] placeholder:text-admin-outline-variant focus:border-admin-primary focus:ring-0"
            />
          }
        />
      </div>

      <aside className="no-scrollbar flex w-full min-w-0 flex-col bg-admin-surface-bright md:h-full md:w-1/4 md:overflow-y-auto">
        {/* Pinned regardless of how tall the content below grows (tags, alt-text,
            future fields) — this is the actual "sticky-sidebar-with-pinned-publish"
            property Module 3 intended; previously Publish was just the first item in
            the same scrolling flow as everything else, so it scrolled away exactly
            when the sidebar grew tall enough to need scrolling at all (Module 11
            consistency pass). */}
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-hairline bg-admin-surface-bright px-lg py-md">
          <button type="button" className="cursor-not-allowed font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant" title="Not built yet">
            Preview
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={!title.trim()}
            className={`morph-button spring-transition relative flex h-10 items-center justify-center rounded bg-admin-primary px-md py-sm font-ui-label-md text-admin-ui-label-md text-admin-surface-bright disabled:opacity-50 ${
              isPublishing ? "success" : ""
            }`}
          >
            <span className="btn-text">{status === "published" ? "Republish" : "Publish"}</span>
            <Check className="btn-icon absolute hidden h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-xl p-lg">
          {errorMessage && <p className="font-ui-label-sm text-admin-ui-label-sm text-red-600">{errorMessage}</p>}

          <CoverImageUploader
            value={coverImage}
            onChange={(value) => {
              setCoverImage(value);
              markDirty();
            }}
            altText={altText}
            onAltTextChange={(text) => {
              setAltText(text);
              markDirty();
            }}
          />

          <div className="flex flex-col gap-md">
            <div className="flex flex-col gap-xs">
              <label htmlFor="article-author" className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">
                Author
              </label>
              <input
                id="article-author"
                type="text"
                value={authorName}
                onChange={(event) => {
                  setAuthorName(event.target.value);
                  markDirty();
                }}
                className="w-full rounded border border-hairline bg-admin-surface px-sm py-sm font-ui-label-sm text-admin-ui-label-sm transition-colors focus:border-admin-primary focus:outline-none focus:ring-0"
              />
            </div>
            <div className="flex flex-col gap-xs">
              {/* Static text, not a form control — a <span> here, not <label>, since
                  there's nothing for it to be programmatically associated with. */}
              <span className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">Last Modified</span>
              <span className="font-ui-label-sm text-admin-ui-label-sm text-admin-outline">
                {formatLastModified(updatedAt)}
              </span>
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor="article-tags" className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">
                Tags
              </label>
              <input
                id="article-tags"
                type="text"
                value={tagsInput}
                onChange={(event) => {
                  setTagsInput(event.target.value);
                  markDirty();
                }}
                placeholder="Add tags (comma separated)"
                className="w-full rounded border border-hairline bg-admin-surface px-sm py-sm font-ui-label-sm text-admin-ui-label-sm transition-colors focus:border-admin-primary focus:outline-none focus:ring-0"
              />
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
