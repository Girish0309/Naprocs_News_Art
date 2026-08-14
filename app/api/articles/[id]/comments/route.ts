import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Article from "@/models/Article";
import Comment from "@/models/Comment";
import { sanitizePlainText } from "@/lib/sanitize";
import { fingerprintFromRequest } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { checkForSpam } from "@/lib/spam-filter";
import { isSameOriginRequest } from "@/lib/csrf";

const createCommentSchema = z.object({
  author_name: z.string().trim().min(1, "Name is required.").max(60, "Name is too long."),
  body: z.string().trim().min(1, "Comment cannot be empty.").max(2000, "Comment is too long."),
});

// Starting point, not a fixed rule — easy to retune once real traffic patterns emerge.
const COMMENT_RATE_LIMIT = 5;
const COMMENT_RATE_WINDOW = "15m";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/articles/[id]/comments">
) {
  const { id } = await context.params;
  await dbConnect();

  const comments = await Comment.find({ article_id: id, status: "visible" })
    .sort({ created_at: 1 })
    .select("author_name body created_at")
    .lean();

  return NextResponse.json({
    comments: comments.map((comment) => ({
      id: String(comment._id),
      author_name: comment.author_name,
      body: comment.body,
      created_at: comment.created_at,
    })),
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/articles/[id]/comments">
) {
  // No session to bind a CSRF token to (anonymous, fingerprint-only) — same-origin
  // check via Origin/Referer instead. See lib/csrf.ts for why this is the right
  // mechanism specifically for this endpoint.
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  }

  const { id } = await context.params;
  const json = await request.json();
  const parsed = createCommentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  await dbConnect();

  // Comments only ever attach to a live, published article — a draft or a
  // nonexistent id both 404 identically.
  const article = await Article.findOne({ _id: id, status: "published" }).select("_id").lean();
  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  const fingerprintHash = fingerprintFromRequest(request);

  const { success, reset } = await rateLimit(`comment:${fingerprintHash}`, COMMENT_RATE_LIMIT, COMMENT_RATE_WINDOW);
  if (!success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "You're commenting too frequently. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // Sanitize after validating raw length, but before storing or spam-checking —
  // never trust raw comment text (classic stored-XSS vector).
  const authorName = sanitizePlainText(parsed.data.author_name);
  const commentBody = sanitizePlainText(parsed.data.body);
  if (!authorName || !commentBody) {
    return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
  }

  const spamResult = checkForSpam(commentBody);

  const comment = await Comment.create({
    article_id: id,
    author_name: authorName,
    body: commentBody,
    fingerprint_hash: fingerprintHash,
    status: spamResult.flagged ? "flagged" : "visible",
    flagged_reason: spamResult.flagged ? spamResult.reason : undefined,
  });

  // Counted regardless of status so the admin dashboard reflects true pending
  // volume; decremented in the admin PATCH route if the comment is later removed.
  await Article.findByIdAndUpdate(id, { $inc: { comment_count: 1 } });

  return NextResponse.json(
    {
      comment: {
        id: String(comment._id),
        author_name: comment.author_name,
        body: comment.body,
        status: comment.status,
        created_at: comment.created_at,
      },
    },
    { status: 201 }
  );
}
