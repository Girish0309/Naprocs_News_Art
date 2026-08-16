"use client";

import { useId, useState } from "react";
import { KeyRound, ShieldCheck, Globe } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-constants";

type TwoFactorSetup = { secret: string; otpauthUrl: string; qrCodeDataUrl: string };

function ChangePasswordCard() {
  const currentId = useId();
  const newId = useId();
  const confirmId = useId();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    if (newPassword !== confirmPassword) {
      setStatus("error");
      setErrorMessage("New password and confirmation don't match.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setStatus("error");
      setErrorMessage(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setStatus("saving");
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error ?? "Couldn't change password.");
        return;
      }
      setStatus("saved");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't change password. Please try again.");
    }
  }

  return (
    <section className="rounded-lg border border-admin-outline-variant bg-admin-surface p-lg">
      <div className="mb-md flex items-center gap-sm">
        <KeyRound className="h-5 w-5 text-admin-primary" />
        <h3 className="font-headline-md text-admin-headline-md text-admin-primary">Change Password</h3>
      </div>
      <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <label htmlFor={currentId} className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">
            Current Password
          </label>
          <input
            id={currentId}
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="w-full rounded border border-hairline bg-admin-surface px-sm py-sm font-ui-label-sm text-admin-ui-label-sm transition-colors focus:border-admin-primary focus:outline-none focus:ring-0"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor={newId} className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">
            New Password
          </label>
          <input
            id={newId}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="w-full rounded border border-hairline bg-admin-surface px-sm py-sm font-ui-label-sm text-admin-ui-label-sm transition-colors focus:border-admin-primary focus:outline-none focus:ring-0"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor={confirmId} className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">
            Confirm New Password
          </label>
          <input
            id={confirmId}
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded border border-hairline bg-admin-surface px-sm py-sm font-ui-label-sm text-admin-ui-label-sm transition-colors focus:border-admin-primary focus:outline-none focus:ring-0"
          />
        </div>

        {status === "error" && errorMessage && (
          <p role="alert" className="font-ui-label-sm text-admin-ui-label-sm text-red-600">
            {errorMessage}
          </p>
        )}
        {status === "saved" && (
          <p className="font-ui-label-sm text-admin-ui-label-sm text-admin-primary">Password updated.</p>
        )}

        <button
          type="submit"
          disabled={status === "saving"}
          className="btn-press self-start rounded-lg bg-admin-primary px-md py-sm font-ui-label-md text-admin-ui-label-md text-admin-on-primary transition-colors hover:bg-admin-surface-tint focus:outline-none focus:ring-2 focus:ring-admin-primary disabled:opacity-50"
        >
          {status === "saving" ? "Saving..." : "Update Password"}
        </button>
      </form>
    </section>
  );
}

function TwoFactorCard() {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "Couldn't generate a QR code.");
        return;
      }
      setSetup(data);
    } catch {
      setErrorMessage("Couldn't generate a QR code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-admin-outline-variant bg-admin-surface p-lg">
      <div className="mb-md flex items-center gap-sm">
        <ShieldCheck className="h-5 w-5 text-admin-primary" />
        <h3 className="font-headline-md text-admin-headline-md text-admin-primary">Two-Factor Authentication</h3>
      </div>

      <p className="mb-md max-w-lg font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant">
        Generate a QR code to pair this account with an authenticator app (Google Authenticator, 1Password, Authy,
        etc.).
      </p>
      {/* Honest about current system state, not just this page's own function — 2FA
          enforcement was Module 2 groundwork only and still isn't wired into the
          sign-in flow, so this setup doesn't yet change what's required to log in. */}
      <p className="mb-md max-w-lg rounded border border-admin-outline-variant bg-admin-surface-container-low px-sm py-sm font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
        Setup is available, but 2FA isn&apos;t enforced at login yet — pairing an authenticator app here won&apos;t
        currently change what&apos;s required to sign in. Backup codes aren&apos;t implemented; this is
        authenticator-app-only for now.
      </p>

      {!setup ? (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="btn-press rounded-lg border border-admin-primary px-md py-sm font-ui-label-md text-admin-ui-label-md text-admin-primary transition-colors hover:bg-admin-surface-container-low focus:outline-none focus:ring-2 focus:ring-admin-primary disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate QR Code"}
        </button>
      ) : (
        <div className="flex flex-col gap-md">
          <p className="max-w-lg font-ui-label-sm text-admin-ui-label-sm text-red-600">
            Scanning a new code replaces any previous authenticator pairing for this account.
          </p>
          {/* Plain <img>, deliberately not next/image — a one-off client-generated
              data:image/png URI (otplib + qrcode), not a stored/optimizable asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URI from qrcode's toDataURL(), not an optimizable remote asset */}
          <img
            src={setup.qrCodeDataUrl}
            alt="QR code to scan with your authenticator app"
            width={200}
            height={200}
            className="rounded border border-admin-outline-variant"
          />
          <div className="flex flex-col gap-xs">
            <span className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">
              Manual entry key
            </span>
            <code className="w-fit rounded bg-admin-surface-container-low px-sm py-xs font-ui-label-sm text-admin-ui-label-sm">
              {setup.secret}
            </code>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="btn-press self-start rounded border border-admin-outline-variant px-md py-sm font-ui-label-md text-admin-ui-label-md text-admin-on-surface-variant transition-colors hover:bg-admin-surface-container-low focus:outline-none focus:ring-2 focus:ring-admin-primary disabled:opacity-50"
          >
            {loading ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
      )}

      {errorMessage && (
        <p role="alert" className="mt-sm font-ui-label-sm text-admin-ui-label-sm text-red-600">
          {errorMessage}
        </p>
      )}
    </section>
  );
}

function SiteMetadataCard({
  siteName,
  siteTitle,
  siteDescription,
}: {
  siteName: string;
  siteTitle: string;
  siteDescription: string;
}) {
  return (
    <section className="rounded-lg border border-admin-outline-variant bg-admin-surface p-lg">
      <div className="mb-md flex items-center gap-sm">
        <Globe className="h-5 w-5 text-admin-primary" />
        <h3 className="font-headline-md text-admin-headline-md text-admin-primary">Site Metadata</h3>
      </div>
      <dl className="flex max-w-lg flex-col gap-sm">
        <div>
          <dt className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">Site Name</dt>
          <dd className="font-ui-label-md text-admin-ui-label-md text-admin-primary">{siteName}</dd>
        </div>
        <div>
          <dt className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">Title</dt>
          <dd className="font-ui-label-md text-admin-ui-label-md text-admin-primary">{siteTitle}</dd>
        </div>
        <div>
          <dt className="font-meta-caps text-admin-meta-caps text-admin-on-surface-variant">Description</dt>
          <dd className="font-ui-label-md text-admin-ui-label-md text-admin-primary">{siteDescription}</dd>
        </div>
      </dl>
      <p className="mt-md max-w-lg rounded border border-admin-outline-variant bg-admin-surface-container-low px-sm py-sm font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
        Not editable here — kept as code-level constants (<code>lib/site-config.ts</code>). Site identity changes are
        rare and deliberate for a single-brand newsletter, and making this DB-editable would mean converting the
        homepage&apos;s static, ISR-cached metadata (Module 10) into a per-request database read — a real
        architectural cost for something that isn&apos;t routine content editing. If that tradeoff is worth making
        later, it&apos;s a small Settings-document model plus updating the three places that import these constants.
      </p>
    </section>
  );
}

export default function SettingsContent({
  siteName,
  siteTitle,
  siteDescription,
}: {
  siteName: string;
  siteTitle: string;
  siteDescription: string;
}) {
  return (
    <main className="mx-auto w-full max-w-container-max flex-1 p-md md:p-lg">
      <header className="mb-lg border-b border-admin-outline-variant pb-md">
        <h2 className="mb-xs font-display-lg text-admin-display-lg text-admin-primary">Settings</h2>
        <p className="font-ui-label-lg text-admin-ui-label-lg text-admin-on-surface-variant">
          Manage your account and console preferences.
        </p>
      </header>

      <div className="flex flex-col gap-lg">
        <ChangePasswordCard />
        <TwoFactorCard />
        <SiteMetadataCard siteName={siteName} siteTitle={siteTitle} siteDescription={siteDescription} />
      </div>
    </main>
  );
}
