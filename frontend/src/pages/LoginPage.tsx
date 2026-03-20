import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import { requireSupabase } from "../lib/supabase";
import LoginImage1 from "../assets/LoginImage1.jpg";

function EyeIcon(props: { open: boolean }) {
  if (props.open) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
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
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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

export function LoginPage() {
  const { login, register, token, user, configured, configError, authError } =
    useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [providerType, setProviderType] = useState("Staff");
  const [showPassword, setShowPassword] = useState(false);
  const [loginImageError, setLoginImageError] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token && user) nav("/", { replace: true });
  }, [token, user, nav]);

  useEffect(() => {
    if (mode !== "register") return;
    // No backend dependency: allow signup and let DB trigger enforce limit.
    setRegistrationOpen(true);
    setError(null);
  }, [mode]);

  return (
    <div className="container">
      <div className="authLayout">
        <div className="card authCard">
          <div className="cardHeader">
            <h1 className="title">Log in to your account</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              Welcome back! Please enter your details.
            </p>
          </div>
          <div className="cardBody">
            {!configured ? (
              <div
                className="muted"
                style={{ color: "rgba(255,204,128,0.95)", marginBottom: 12 }}
              >
                {configError}
              </div>
            ) : null}
            {authError ? (
              <div
                className="muted"
                style={{ color: "rgba(255,204,128,0.95)", marginBottom: 12 }}
              >
                {authError}
              </div>
            ) : null}

            <div className="authTabs" style={{ marginBottom: 12 }}>
              <button
                className="authTab"
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                  setMessage(null);
                }}
                aria-pressed={mode === "register"}
              >
                Sign up
              </button>
              <button
                className="authTab"
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setMessage(null);
                }}
                aria-pressed={mode === "login"}
              >
                Log in
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setMessage(null);
                setLoading(true);
                try {
                  if (mode === "login") {
                    await login(email, password);
                    nav("/", { replace: true });
                  } else {
                    if (!registrationOpen)
                      throw new Error("Registration is closed (user limit reached).");
                    if (!firstName.trim()) throw new Error("First name is required.");
                    if (!providerType.trim())
                      throw new Error("Provider type is required.");
                    await register(email, password, {
                      firstName: firstName.trim(),
                      phone: phone.trim() || undefined,
                      providerType: providerType.trim()
                    });
                    setMessage(
                      "Registration successful. Check your email to verify your account, then sign in."
                    );
                    setMode("login");
                  }
                } catch (err: any) {
                  setError(err?.message ?? "Request failed");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <div className="row authStack">
                <label className="formLabel">Email</label>
                <input
                  className="input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                />

                {mode === "register" ? (
                  <>
                    <label className="formLabel">First Name</label>
                    <input
                      className="input"
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      disabled={loading}
                    />
                    <label className="formLabel">Phone Number</label>
                    <input
                      className="input"
                      placeholder="Phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      disabled={loading}
                    />
                    <label className="formLabel">Provider Type</label>
                    <input
                      className="input"
                      placeholder="Provider type"
                      value={providerType}
                      onChange={(e) => setProviderType(e.target.value)}
                      disabled={loading}
                    />
                  </>
                ) : null}

                <label className="formLabel" style={{ marginTop: 4 }}>
                  Password
                </label>
                <div className="inputWrap">
                  <input
                    className="input inputWithIcon"
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
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

                {mode === "login" ? (
                  <button
                    type="button"
                    className="button"
                    disabled={!configured || loading}
                    onClick={async () => {
                      setError(null);
                      setMessage(null);
                      if (!email.trim()) {
                        setError("Enter your email first.");
                        return;
                      }
                      try {
                        const supabase = requireSupabase();
                        const { error } = await supabase.auth.resetPasswordForEmail(
                          email.trim(),
                          {
                            redirectTo: `${window.location.origin}/reset-password`
                          }
                        );
                        if (error) throw error;
                        setMessage(
                          "Password reset email sent. Check your inbox (and spam)."
                        );
                      } catch (err: any) {
                        setError(err?.message ?? "Failed to send reset email");
                      }
                    }}
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    Forgot password
                  </button>
                ) : null}

                {message ? (
                  <div
                    className="muted"
                    style={{ color: "rgba(144,238,144,0.9)" }}
                  >
                    {message}
                  </div>
                ) : null}
                {error ? (
                  <div
                    className="muted"
                    style={{ color: "rgba(255,88,118,0.92)" }}
                  >
                    {error}
                  </div>
                ) : null}

                <button
                  className="button"
                  type="submit"
                  disabled={!configured || loading || (mode === "register" && !registrationOpen)}
                  style={{ marginTop: 4 }}
                >
                  {loading
                    ? mode === "login"
                      ? "Signing in..."
                      : "Creating..."
                    : mode === "login"
                      ? "Sign in"
                      : "Sign up"}
                </button>

                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    className="authLink"
                    onClick={() => setMode("register")}
                    disabled={loading}
                  >
                    Sign up
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="card authImageCard">
          {loginImageError ? (
            <div className="authImagePlaceholder">LoginImage1</div>
          ) : (
            <img
              className="authImage"
              src={LoginImage1}
              alt="Login"
              onError={() => setLoginImageError(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
