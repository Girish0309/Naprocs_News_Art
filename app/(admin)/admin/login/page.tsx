import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await getServerAuthSession();
  if (session) {
    redirect("/admin/dashboard");
  }

  const { reason } = await searchParams;
  const loggedOutForInactivity = reason === "idle-timeout";

  return (
    <div className="paper-grain flex h-full min-h-screen items-center justify-center p-md text-admin-on-surface">
      <div className="w-full max-w-[420px] rounded-lg border border-admin-outline-variant bg-admin-surface-bright p-lg shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
        <div className="mb-lg text-center">
          <h1 className="font-headline-lg text-admin-headline-lg text-admin-primary tracking-tight mb-xs">
            The Editorial
          </h1>
          <p className="font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">
            Sign in to the author console.
          </p>
        </div>
        {loggedOutForInactivity && (
          <p className="mb-md rounded border border-admin-outline-variant bg-admin-surface-container-low px-sm py-sm font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
            You were signed out after 15 minutes of inactivity. Please sign in again.
          </p>
        )}
        <LoginForm />
        <div className="mt-lg border-t border-admin-outline-variant pt-md text-center">
          <p className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
            Request an invitation to{" "}
            <span className="cursor-not-allowed text-admin-primary underline underline-offset-4">
              publish with us
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
