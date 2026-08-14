import Article from "@/models/Article";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/**
 * Generates a slug from `title`, appending `-2`, `-3`, etc. until it doesn't collide
 * with another article. `excludeId` lets an update keep its own existing slug.
 */
export async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || "article";
  let candidate = base;
  let suffix = 2;

  while (
    await Article.exists({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
