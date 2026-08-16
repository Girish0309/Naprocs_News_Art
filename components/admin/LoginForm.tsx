"use client";

import { useState, useRef, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// The TOTP step below is a VISUAL two-step flow only (per the Module 3 restyle brief:
// "visual pass only, keep Module 2 auth logic untouched"). Step 1 always advances to
// step 2 — nothing server-side is checked until the real signIn() call fires on step 2,
// and the 6-digit code isn't sent anywhere, since NextAuth's authorize() doesn't verify
// TOTP yet (Module 2 groundwork: enforcement is a deliberate future step). Once 2FA
// enforcement lands server-side, this needs a real "does this account require a code"
// check between steps 1 and 2.
export default function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const totpInputRef = useRef<HTMLInputElement>(null);

  function handleContinue() {
    setError(null);
    setIsSubmitting(true);
    window.setTimeout(() => {
      setIsSubmitting(false);
      setStep(2);
      window.setTimeout(() => totpInputRef.current?.focus(), 50);
    }, 800);
  }

  async function handleVerifyAndSignIn() {
    setError(null);
    setIsSubmitting(true);

    try {
      const preflight = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!preflight.ok) {
        const data = await preflight.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Please try again.");
        setStep(1);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
        setStep(1);
        return;
      }

      setSucceeded(true);
      router.push("/admin/dashboard");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) {
      handleContinue();
    } else {
      void handleVerifyAndSignIn();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-md">
      <div className="flex flex-col gap-md">
        <div className="floating-label-group">
          <input
            id="email"
            type="email"
            required
            placeholder=" "
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={step === 2}
            className={`floating-label-input font-ui-label-md text-admin-ui-label-md text-admin-on-surface ${
              step === 2 ? "bg-admin-surface-container-low text-admin-on-surface-variant" : ""
            }`}
          />
          <label htmlFor="email" className="floating-label font-ui-label-sm text-admin-ui-label-sm">
            Email address
          </label>
        </div>
        <div className="floating-label-group">
          <input
            id="password"
            type="password"
            required
            placeholder=" "
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            readOnly={step === 2}
            className={`floating-label-input font-ui-label-md text-admin-ui-label-md text-admin-on-surface ${
              step === 2 ? "bg-admin-surface-container-low text-admin-on-surface-variant" : ""
            }`}
          />
          <label htmlFor="password" className="floating-label font-ui-label-sm text-admin-ui-label-sm">
            Password
          </label>
        </div>
      </div>

      <div className={`totp-container ${step === 2 ? "expanded" : ""}`}>
        <p className="mb-base font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant">
          Enter the 6-digit code from your authenticator app.
        </p>
        <div className="floating-label-group">
          <input
            ref={totpInputRef}
            id="totp"
            type="text"
            maxLength={6}
            pattern="\d{6}"
            placeholder=" "
            value={totp}
            onChange={(event) => setTotp(event.target.value.replace(/\D/g, ""))}
            className="floating-label-input text-center font-ui-label-md text-admin-ui-label-md tracking-[0.5em] text-admin-on-surface"
          />
          <label htmlFor="totp" className="floating-label font-ui-label-sm text-admin-ui-label-sm">
            Auth Code
          </label>
        </div>
      </div>

      <div className="mt-xs flex items-center justify-between">
        <label className="group flex cursor-pointer items-center gap-xs">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-admin-outline-variant text-admin-primary transition-colors focus:ring-admin-primary focus:ring-offset-0"
          />
          <span className="font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant transition-colors group-hover:text-admin-on-surface">
            Remember me
          </span>
        </label>
        <span className="cursor-not-allowed font-ui-label-sm text-admin-ui-label-sm text-admin-on-surface-variant underline decoration-admin-outline-variant underline-offset-4">
          Forgot password?
        </span>
      </div>

      {error && <p className="font-ui-label-sm text-admin-ui-label-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className={`btn-press mt-base flex w-full items-center justify-center rounded-lg py-sm font-ui-label-md text-admin-ui-label-md transition-colors ${
          succeeded ? "bg-admin-secondary text-admin-on-secondary" : "bg-admin-primary text-admin-on-primary"
        } disabled:opacity-80`}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : succeeded ? (
          "Success"
        ) : step === 1 ? (
          "Continue"
        ) : (
          "Verify & Sign In"
        )}
      </button>
    </form>
  );
}
