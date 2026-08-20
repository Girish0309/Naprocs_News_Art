import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { QueryFilter } from "mongoose";
import dbConnect from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import Comment, { type CommentDocument } from "@/models/Comment";
import Article from "@/models/Article";
import { withDbErrorHandling } from "@/lib/with-db-error-handling";

// Explicit, not left to Next.js's implicit "reads a cookie -> opt out of caching"
// detection (which is what was relying on getServerAuthSession()'s cookie read here
// before this). That implicit behavior is exactly the kind of thing that can silently
// regress across a Next.js version bump or a refactor that changes how the session is
// read — matches the existing precedent at app/sitemap.ts for the same reason.
export const dynamic = "force-dynamic";

const updateCommentSchema = z.object({
  comment_id: z.string().min(1),
  status: z.enum(["visible", "flagged", "removed"]),
});

const listCommentsQuerySchema = z.object({
  status: z.enum(["visible", "flagged", "removed", "all"]).optional(),
});

export const GET = withDbErrorHandling(async (request: NextRequest) => {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = listCommentsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.issues }, { status: 400 });
  }

  await dbConnect();

  // Defaults to the moderation queue (flagged comments awaiting a decision), but
  // accepts "visible"/"removed" too for an admin who wants to browse those, and "all"
  // for the admin console's "All Comments" tab — added because no path existed to
  // retroactively remove an already-visible (auto-approved) comment; only flagged ones
  // were ever reachable. An out-of-enum value still 400s instead of silently falling
  // back to "every status" — the Module 11 security-pass tightening this preserves —
  // "all" is a new explicit enum member, not a loosening of that validation.
  const status = parsedQuery.data.status ?? "flagged";
  const filter: QueryFilter<CommentDocument> = status === "all" ? {} : { status };

  const comments = await Comment.find(filter)
    .select("author_name body status flagged_reason created_at article_id")
    .sort({ created_at: -1 })
    .populate("article_id", "title slug")
    .lean();

  return NextResponse.json({
    comments: comments.map((comment) => {
      const article = comment.article_id as unknown as { _id: unknown; title?: string; slug?: string } | null;
      return {
        id: String(comment._id),
        author_name: comment.author_name,
        body: comment.body,
        status: comment.status,
        flagged_reason: comment.flagged_reason ?? null,
        created_at: comment.created_at,
        article: article
          ? { id: String(article._id), title: article.title ?? "", slug: article.slug ?? "" }
          : null,
      };
    }),
  });
});

export const PATCH = withDbErrorHandling(async (request: NextRequest) => {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  await dbConnect();

  const { comment_id, status } = parsed.data;
  const comment = await Comment.findById(comment_id).select("status article_id");
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  // comment_count is incremented at creation regardless of status (Module 7 spec),
  // so it only needs adjusting here when a comment moves into/out of "removed".
  //
  // The update is a compare-and-swap on the status we just read (filtering on both
  // _id AND the previous status), not a plain findById + save. Two concurrent PATCH
  // requests for the same comment (double-click, retried request) would otherwise both
  // read the same "before" status and both apply their own $inc, double-counting the
  // change — the CAS means only whichever request's write actually lands first gets to
  // apply the count delta; the loser's filter no longer matches and it's a no-op.
  const previousStatus = comment.status;
  // Mongoose drops `undefined` values from a plain update object (they never reach
  // MongoDB's $set), so clearing flagged_reason needs an explicit $unset rather than
  // assigning it undefined — that only works via a full document .save(), not here.
  const update = status === "flagged" ? { $set: { status } } : { $set: { status }, $unset: { flagged_reason: "" } };
  const updated = await Comment.findOneAndUpdate({ _id: comment_id, status: previousStatus }, update, {
    new: true,
  }).select("status article_id");

  if (!updated) {
    // Someone else already transitioned this comment between our read and write —
    // nothing left for us to do (and no count delta to apply on top of theirs).
    return NextResponse.json({ ok: true });
  }

  const wasRemoved = previousStatus === "removed";
  const willBeRemoved = updated.status === "removed";
  if (wasRemoved !== willBeRemoved) {
    await Article.findByIdAndUpdate(updated.article_id, {
      $inc: { comment_count: willBeRemoved ? -1 : 1 },
    });
  }

  return NextResponse.json({ ok: true });
});
