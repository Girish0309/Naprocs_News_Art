import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/articles/[id]">
) {
  // The dynamic segment is named `id` because sibling routes (comments, react) share
  // this folder position and Next.js requires one param name per path position — the
  // value passed here is still the article's slug, matching /articles/[slug] on the
  // public site.
  const { id: slug } = await context.params;
  await dbConnect();

  // TODO: find the published Article by slug and return it, or 404 if not found/not published.
  return NextResponse.json({ error: "Not implemented", slug }, { status: 501 });
}
