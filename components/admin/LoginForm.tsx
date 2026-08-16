"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
        return;
      }

      setSucceeded(true);
      router.push("/admin/dashboard");
      router.refresh();
    } finally {
      setIsSubmitting(false);
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
            className="floating-label-input font-ui-label-md text-admin-ui-label-md text-admin-on-surface"
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
            className="floating-label-input font-ui-label-md text-admin-ui-label-md text-admin-on-surface"
          />
          <label htmlFor="password" className="floating-label font-ui-label-sm text-admin-ui-label-sm">
            Password
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
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : succeeded ? "Success" : "Sign In"}
      </button>
    </form>
  );
}
