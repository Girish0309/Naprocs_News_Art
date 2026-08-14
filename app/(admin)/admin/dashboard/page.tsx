import { requireAdminSession } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import DashboardContent from "@/components/admin/DashboardContent";

export default async function AdminDashboardPage() {
  const session = await requireAdminSession();

  return (
    <AdminShell adminName={session.user.name}>
      <DashboardContent />
    </AdminShell>
  );
}
