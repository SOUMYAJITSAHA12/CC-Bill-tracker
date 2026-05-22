"use client";

import { useState } from "react";
import { Spinner } from "@/components/Spinner";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setInfo("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    // Force a full reload so server middleware picks up the new session cookies
    // and the user lands on a fully-authenticated dashboard.
    window.location.href = "/";
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    if (password.length < 8) {
      setLoading(false);
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setLoading(false);
      setError("Passwords do not match");
      return;
    }

    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    // If Supabase email confirmation is OFF, session is returned immediately
    // and we can drop the user straight into the dashboard. If it's ON, the
    // user has to click the confirmation link first.
    if (data.session) {
      window.location.href = "/";
      return;
    }
    setInfo(
      "Account created. Check your inbox to confirm your email before signing in."
    );
    setMode("signin");
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email above first, then click 'Forgot password'");
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setInfo("Password reset link sent. Check your inbox.");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8">
        <h1 className="text-2xl font-semibold mb-1">CC Bill Tracker</h1>
        <p className="text-[var(--muted)] text-sm mb-6">
          {mode === "signin"
            ? "Sign in to your account"
            : "Create a new account — your cards and bills stay private."}
        </p>

        <div
          role="tablist"
          aria-label="Authentication mode"
          className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-lg bg-[var(--bg)] border border-[var(--border)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            onClick={() => switchMode("signin")}
            className={`py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "signin"
                ? "bg-[var(--card)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => switchMode("signup")}
            className={`py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "signup"
                ? "bg-[var(--card)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            Sign up
          </button>
        </div>

        <form
          onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
          className="space-y-3"
        >
          <label className="block text-sm">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            Password
            <input
              type="password"
              required
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              minLength={8}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
            />
          </label>

          {mode === "signup" && (
            <label className="block text-sm">
              Confirm password
              <input
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
          )}

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
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 py-2 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            {loading
              ? mode === "signin"
                ? "Signing in…"
                : "Creating account…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>

          {mode === "signin" && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="block w-full text-center text-xs text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-50"
            >
              Forgot password?
            </button>
          )}
        </form>

        <p className="text-xs text-[var(--muted)] mt-6 text-center">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="text-brand-600 hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="text-brand-600 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
