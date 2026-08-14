import { notFound } from "next/navigation";
import mongoose from "mongoose";
import { requireAdminSession } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Article from "@/models/Article";
import AdminShell from "@/components/admin/AdminShell";
import ArticleForm from "@/components/admin/ArticleForm";

export default async function EditArticlePage(props: PageProps<"/admin/articles/[id]/edit">) {
  const session = await requireAdminSession();
  const { id } = await props.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    notFound();
  }

  await dbConnect();
  const article = await Article.findById(id).lean();
  if (!article) {
    notFound();
  }

  return (
    <AdminShell adminName={session.user.name} fullHeight>
      <ArticleForm
        articleId={String(article._id)}
        initialTitle={article.title}
        initialContent={article.body_json && Object.keys(article.body_json as object).length > 0 ? (article.body_json as object) : article.body_html}
        initialTags={article.tags}
        initialAuthorName={article.author_name || session.user.name}
        initialCoverImage={article.cover_image ?? null}
        initialStatus={article.status}
        initialUpdatedAt={article.updated_at?.toISOString()}
        initialSlug={article.slug}
      />
    </AdminShell>
  );
}
