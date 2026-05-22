"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { createClient } from "@/lib/supabase/client";

/**
 * Landing page for the Supabase password-recovery email link.
 *
 * Flow:
 *   1. User clicks "Forgot password" on /login → Supabase sends a recovery email.
 *   2. Email link goes to /auth/callback?next=/reset-password.
 *   3. /auth/callback exchanges the recovery code for a session, then redirects here.
 *   4. This page lets the user pick a new password and signs them in.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    setInfo("Password updated. Redirecting…");
    setTimeout(() => {
      window.location.href = "/";
    }, 800);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8">
        <h1 className="text-2xl font-semibold mb-2">Set a new password</h1>

        {hasSession === false ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--danger)]">
              This recovery link is invalid or has already been used.
            </p>
            <a
              href="/login"
              className="block text-center w-full rounded-lg bg-brand-600 hover:bg-brand-700 py-2 font-medium"
            >
              Back to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-[var(--muted)] text-sm mb-2">
              Pick a new password for your account.
            </p>
            <label className="block text-sm">
              New password
              <input
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Confirm password
              <input
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                placeholder="Re-enter the password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
            {error && (
              <p className="text-sm text-[var(--danger)]" role="alert">
                {error}
              </p>
            )}
            {info && (
              <p className="text-sm text-[var(--ok)]" role="status">
                {info}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || hasSession === null}
              className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 py-2 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Spinner />}
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
