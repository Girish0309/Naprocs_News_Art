import { requireAdminSession } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import SettingsContent from "@/components/admin/SettingsContent";
import { SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site-config";

export default async function AdminSettingsPage() {
  const session = await requireAdminSession();

  return (
    <AdminShell adminName={session.user.name}>
      <SettingsContent siteName={SITE_NAME} siteTitle={SITE_TITLE} siteDescription={SITE_DESCRIPTION} />
    </AdminShell>
  );
}
