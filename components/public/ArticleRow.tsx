import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";

export interface ArticleRowData {
  slug: string;
  title: string;
  author_name: string;
  excerpt: string;
  tags: string[];
  cover_image: { url: string; alt_text?: string } | null;
  published_at: string | Date | null;
  like_count: number;
  read_time_minutes: number;
}

function formatShortDate(value: string | Date | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Meta({ tags, readTimeMinutes, center }: { tags: string[]; readTimeMinutes: number; center?: boolean }) {
  return (
    <div
      className={`mb-3 flex items-center gap-2 font-ui-meta text-journal-ui-meta uppercase tracking-wider text-journal-secondary ${
        center ? "justify-center" : ""
      }`}
    >
      <span>{tags[0] ?? "Essay"}</span>
      <span className="h-1 w-1 rounded-full bg-journal-outline-variant" />
      <span>{readTimeMinutes} Min Read</span>
    </div>
  );
}

/**
 * Two visual variants from the mockup: a standard image-left/text-right row, and a
 * text-only, centered "feature" row used every 3rd item so the listing doesn't feel
 * monotonous (design-reference/user/homepage.html's "Silence as a Radical Act" row).
 */
export default function ArticleRow({ article, variant }: { article: ArticleRowData; variant: "standard" | "feature" }) {
  if (variant === "feature") {
    return (
      <Link
        href={`/articles/${article.slug}`}
        className="group -mx-4 flex cursor-pointer flex-col rounded-lg border-t border-journal-outline-variant bg-journal-surface-container-lowest px-4 py-12 transition-colors duration-300 hover:bg-journal-surface-container-low"
      >
        <div className="mx-auto flex max-w-xl flex-grow flex-col items-center justify-center text-center">
          <Meta tags={article.tags} readTimeMinutes={article.read_time_minutes} center />
          <h2 className="mb-6 font-display-lg text-journal-display-lg leading-tight text-journal-on-surface transition-colors group-hover:text-journal-primary-container">
            {article.title}
          </h2>
          <p className="mb-8 font-article-body text-journal-article-body text-journal-secondary">{article.excerpt}</p>
          <div className="flex items-center justify-center gap-6 font-ui-meta text-journal-ui-meta text-journal-on-surface-variant">
            <span className="font-semibold text-journal-on-surface">{article.author_name}</span>
            <span className="text-journal-outline-variant">|</span>
            <span>{formatShortDate(article.published_at)}</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/articles/${article.slug}`}
      className="group -mx-4 flex cursor-pointer flex-col items-start gap-8 rounded-lg border-t border-journal-outline-variant px-4 py-8 transition-colors duration-300 hover:bg-journal-surface-container-low md:flex-row"
    >
      <div className="relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-md bg-journal-surface-container-high md:w-1/3">
        {article.cover_image && (
          <Image
            src={article.cover_image.url}
            alt={article.cover_image.alt_text ?? ""}
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        )}
      </div>
      <div className="flex h-full flex-grow flex-col justify-between">
        <div>
          <Meta tags={article.tags} readTimeMinutes={article.read_time_minutes} />
          <h2 className="mb-3 font-headline-md text-journal-headline-md text-journal-on-surface transition-colors group-hover:text-journal-primary-container">
            {article.title}
          </h2>
          <p className="mb-6 line-clamp-3 font-article-body text-journal-article-body text-journal-secondary">
            {article.excerpt}
          </p>
        </div>
        <div className="flex items-center justify-between font-ui-meta text-journal-ui-meta text-journal-on-surface-variant">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-journal-on-surface">{article.author_name}</span>
            <span>{formatShortDate(article.published_at)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Heart className="h-4 w-4" />
            <span>{article.like_count}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
