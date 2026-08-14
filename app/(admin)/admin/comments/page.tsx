import { requireAdminSession } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import CommentsQueue from "@/components/admin/CommentsQueue";

export default async function AdminCommentsPage() {
  const session = await requireAdminSession();

  return (
    <AdminShell adminName={session.user.name}>
      <CommentsQueue />
    </AdminShell>
  );
}
