import { requireAdminSession } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import ArticleForm from "@/components/admin/ArticleForm";

export default async function NewArticlePage() {
  const session = await requireAdminSession();

  return (
    <AdminShell adminName={session.user.name} fullHeight>
      <ArticleForm initialAuthorName={session.user.name} />
    </AdminShell>
  );
}
