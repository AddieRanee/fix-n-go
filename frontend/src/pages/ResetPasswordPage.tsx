import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requireSupabase } from "../lib/supabase";

function EyeIcon(props: { open: boolean }) {
  if (props.open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M2.2 12s3.6-7 9.8-7 9.8 7 9.8 7-3.6 7-9.8 7S2.2 12 2.2 12Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M2.2 12s3.6-7 9.8-7c2.2 0 4.1.7 5.7 1.7M21.8 12s-3.6 7-9.8 7c-2.2 0-4.1-.7-5.7-1.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9.7 9.7a3.5 3.5 0 0 0 4.6 4.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ResetPasswordPage() {
  const nav = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = requireSupabase();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setHasSession(Boolean(data.session));
      } catch {
        if (cancelled) return;
        setHasSession(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container">
      <div
        className="card"
        style={{ width: "min(520px, 100%)", margin: "36px auto 0" }}
      >
        <div className="cardHeader">
          <h1 className="title">Reset password</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Choose a new password for your account.
          </p>
        </div>
        <div className="cardBody">
          {checking ? (
            <div className="muted">Loading...</div>
          ) : !hasSession ? (
            <div className="muted">
              Open this page from the password reset email link, then try again.
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setMessage(null);
                if (password.length < 6) {
                  setError("Password must be at least 6 characters.");
                  return;
                }
                if (password !== confirm) {
                  setError("Passwords do not match.");
                  return;
                }

                setLoading(true);
                try {
                  const supabase = requireSupabase();
                  const { error } = await supabase.auth.updateUser({ password });
                  if (error) throw error;
                  setMessage("Password updated. You can now sign in.");
                  await supabase.auth.signOut();
                  setTimeout(() => nav("/login", { replace: true }), 500);
                } catch (err: any) {
                  setError(err?.message ?? "Failed to reset password");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <div className="row authStack">
                <label className="formLabel">New Password</label>
                <div className="inputWrap">
                  <input
                    className="input inputWithIcon"
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="iconButton"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    disabled={loading}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>

                <label className="formLabel">Confirm Password</label>
                <div className="inputWrap">
                  <input
                    className="input inputWithIcon"
                    placeholder="••••••••"
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="iconButton"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    disabled={loading}
                  >
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>

                {message ? (
                  <div className="muted" style={{ color: "rgba(144,238,144,0.9)" }}>
                    {message}
                  </div>
                ) : null}
                {error ? (
                  <div className="muted" style={{ color: "rgba(255,88,118,0.92)" }}>
                    {error}
                  </div>
                ) : null}

                <button className="button" type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Update password"}
                </button>
              </div>
            </form>
          )}

          <div className="hr" />
          <button
            className="button"
            type="button"
            onClick={() => nav("/login")}
            style={{ background: "rgba(255,255,255,0.06)", width: "100%" }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
