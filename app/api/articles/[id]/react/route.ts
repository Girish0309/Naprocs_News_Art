import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Article from "@/models/Article";
import Reaction, { type ReactionType } from "@/models/Reaction";
import { fingerprintFromRequest } from "@/lib/fingerprint";
import { isSameOriginRequest } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";

const reactSchema = z.object({
  type: z.enum(["like", "dislike"]),
});

// Higher than comments' 5/15min — a single click, no typing, and a legitimate reader
// browsing several articles in one session will genuinely toggle more than 5 reactions.
// Starting point, not a fixed rule, same as every other threshold in this app.
const REACT_RATE_LIMIT = 30;
const REACT_RATE_WINDOW = "15m";

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 11000;
}

interface ReactionResult {
  likeDelta: number;
  dislikeDelta: number;
  reaction: ReactionType | null;
}

/**
 * Applies one reaction click for a fingerprint+article pair. Three cases, worked
 * through explicitly rather than left implicit:
 *   1. No existing reaction         -> create one, +1 to the requested type
 *   2. Existing reaction, same type -> un-react: delete it, -1 from that type
 *   3. Existing reaction, other type -> switch: -1 from the old type, +1 to the new
 *
 * Both mutations below (the delete and the upsert) are independently atomic
 * single-document MongoDB operations, each conditioned on its OWN query filter — not
 * a value read in an earlier round-trip and branched on in JS, which is the
 * find-then-write pattern the Module 7 audit flagged as racy. The unique compound
 * index on (article_id, fingerprint_hash) (models/Reaction.ts) is what actually makes
 * a duplicate reaction impossible under concurrency; the try/catch below exists to
 * handle the loser of that race gracefully rather than 500ing.
 */
async function applyReaction(
  articleId: string,
  fingerprintHash: string,
  requestedType: ReactionType,
  attempt = 0
): Promise<ReactionResult> {
  // Case 2 first: a same-type match here means "un-react". The filter includes
  // `type`, so this only fires when that's genuinely what's happening.
  const removed = await Reaction.findOneAndDelete({
    article_id: articleId,
    fingerprint_hash: fingerprintHash,
    type: requestedType,
  });
  if (removed) {
    return requestedType === "like"
      ? { likeDelta: -1, dislikeDelta: 0, reaction: null }
      : { likeDelta: 0, dislikeDelta: -1, reaction: null };
  }

  // Otherwise: no reaction exists yet, or one exists with the opposite type. A single
  // upsert covers both — no match inserts, a match updates its type.
  try {
    const previous = await Reaction.findOneAndUpdate(
      { article_id: articleId, fingerprint_hash: fingerprintHash },
      {
        $set: { type: requestedType },
        $setOnInsert: { article_id: articleId, fingerprint_hash: fingerprintHash, created_at: new Date() },
      },
      { upsert: true, new: false }
    ).lean();

    if (!previous) {
      return requestedType === "like"
        ? { likeDelta: 1, dislikeDelta: 0, reaction: "like" }
        : { likeDelta: 0, dislikeDelta: 1, reaction: "dislike" };
    }
    if (previous.type === requestedType) {
      // A concurrent request landed between our delete-check above and this upsert
      // and already left the reaction in the state we were about to write — nothing
      // left to apply count-wise. See the Module 8 report for how this is reached.
      return { likeDelta: 0, dislikeDelta: 0, reaction: requestedType };
    }
    return requestedType === "like"
      ? { likeDelta: 1, dislikeDelta: -1, reaction: "like" }
      : { likeDelta: -1, dislikeDelta: 1, reaction: "dislike" };
  } catch (error) {
    // Two concurrent requests for the same fingerprint+article with no prior reaction
    // can both see "nothing to update" and both attempt to insert; the unique index
    // lets only one succeed, and the loser lands here instead of silently duplicating
    // data. Retry once — by now the winner's write has committed, so this becomes a
    // deterministic (non-racing) delete-or-update rather than another insert attempt.
    if (isDuplicateKeyError(error) && attempt === 0) {
      return applyReaction(articleId, fingerprintHash, requestedType, attempt + 1);
    }
    throw error;
  }
}

export async function GET(request: NextRequest, context: RouteContext<"/api/articles/[id]/react">) {
  const { id } = await context.params;
  await dbConnect();

  const fingerprintHash = fingerprintFromRequest(request);
  const [article, reaction] = await Promise.all([
    Article.findOne({ _id: id, status: "published" }).select("like_count dislike_count").lean(),
    Reaction.findOne({ article_id: id, fingerprint_hash: fingerprintHash }).select("type").lean(),
  ]);

  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  return NextResponse.json({
    like_count: article.like_count,
    dislike_count: article.dislike_count,
    reaction: reaction?.type ?? null,
  });
}

export async function POST(request: NextRequest, context: RouteContext<"/api/articles/[id]/react">) {
  // Same-origin check, not a token — no session exists here to bind a CSRF token to.
  // See lib/csrf.ts.
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  }

  const { id } = await context.params;
  const json = await request.json();
  const parsed = reactSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await dbConnect();

  const article = await Article.findOne({ _id: id, status: "published" }).select("_id");
  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  const fingerprintHash = fingerprintFromRequest(request);

  const { success, reset } = await rateLimit(`react:${fingerprintHash}`, REACT_RATE_LIMIT, REACT_RATE_WINDOW);
  if (!success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many reactions. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const { likeDelta, dislikeDelta, reaction } = await applyReaction(id, fingerprintHash, parsed.data.type);

  const updated = await Article.findByIdAndUpdate(
    id,
    { $inc: { like_count: likeDelta, dislike_count: dislikeDelta } },
    { new: true }
  ).select("like_count dislike_count");

  return NextResponse.json({
    like_count: updated?.like_count ?? 0,
    dislike_count: updated?.dislike_count ?? 0,
    reaction,
  });
}
