import { useEffect, useState } from "react";
import { AuthLandingRail } from "./AuthLandingRail";
import { AuthWorkflowDemo } from "./AuthWorkflowDemo";

interface Props {
  signIn: (email: string, password: string) => Promise<unknown>;
  signUp: (email: string, password: string, displayName?: string) => Promise<unknown>;
  signInWithGoogle: () => Promise<unknown>;
  resetPassword: (email: string) => Promise<unknown>;
}

const AUTH_ERRORS: Record<string, string> = {
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/user-not-found": "No account found with this email.",
  "auth/wrong-password": "Incorrect password.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/popup-closed-by-user": "Google sign-in was cancelled.",
};

function getErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string } | undefined;
  const code = err?.code || "";
  return AUTH_ERRORS[code] || err?.message || "An error occurred.";
}

export function AuthScreen({ signIn, signUp, signInWithGoogle, resetPassword }: Props) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    // Ensure the landing always starts at the top, even if a hash (e.g. #auth-account) is present.
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    // Some browsers apply hash scrolling after paint; re-assert scroll position.
    window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }), 0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "reset") {
        await resetPassword(email);
        setResetSent(true);
      } else if (mode === "signup") {
        await signUp(email, password, displayName || undefined);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const formTitle =
    mode === "reset" ? "Reset password" : mode === "signup" ? "Create your studio" : "Sign in";

  const formSubtitle =
    mode === "reset"
      ? "We’ll email you a link to choose a new password."
      : mode === "signup"
        ? "Start generating devices from natural language."
        : "Welcome back — pick up where you left off.";

  return (
    <div className="auth-screen">
      <div id="auth-top" />
      <AuthLandingRail />
      <div className="auth-screen-body">
        <div className="auth-screen-noise" aria-hidden="true" />
        <div className="auth-m3-layout">
          <div className="auth-m3-hero">
          <section className="auth-chunk auth-chunk--brand" aria-labelledby="auth-landing-title">
            <p className="auth-chunk-eyebrow">AI · Ableton · Max for Live</p>
            <h1 id="auth-landing-title" className="auth-chunk-title">
              <span className="auth-chunk-title-max">MaxPy</span>
              <span className="auth-chunk-title-studio"> Studio</span>
            </h1>
            <p className="auth-chunk-lede">
              Generate Max for Live plugins from text descriptions.
            </p>
            <a className="auth-chunk-cta" href="#auth-account">
              Get started
            </a>
          </section>

          <div className="auth-hero-visual-sizer">
            <section className="auth-chunk auth-chunk--visual" aria-label="MaxPy Studio">
              <div className="auth-chunk-visual-inner">
                <img
                  src="/logo.webp"
                  alt=""
                  className="auth-chunk-hero-fish"
                  width={520}
                  height={520}
                  decoding="async"
                />
              </div>
            </section>
          </div>
          </div>

        <div className="auth-spotlight" id="auth-demo-section">
          <div className="auth-spotlight-intro">
            <h2 className="auth-spotlight-heading">Try the flow</h2>
            <p className="auth-spotlight-lede">
              Send a prompt to generate a patch graph and Python output. Then drag nodes to rearrange and explore the
              structure. Download the .amxd file and drag it onto a MIDI track in Ableton Live to try it out.
            </p>
          </div>

          <AuthWorkflowDemo />
        </div>

        <section className="auth-chunk auth-chunk--signin" id="auth-account" aria-labelledby="auth-form-title">
          <form className="auth-card" onSubmit={handleSubmit}>
            <h2 id="auth-form-title" className="auth-form-title">
              {formTitle}
            </h2>
            <p className="auth-form-subtitle">{formSubtitle}</p>

            {mode !== "reset" && (
              <>
                <button type="button" className="auth-google" onClick={handleGoogle} disabled={loading}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>

                <div className="auth-divider">
                  <span>or</span>
                </div>
              </>
            )}

            {mode === "signup" && (
              <div className="auth-field">
                <label htmlFor="auth-display-name">Display Name</label>
                <input
                  id="auth-display-name"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {mode !== "reset" && (
              <div className="auth-field">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
            )}

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            {resetSent && (
              <div className="auth-success" role="status">
                Reset email sent! Check your inbox.
              </div>
            )}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading
                ? "…"
                : mode === "reset"
                  ? "Send reset email"
                  : mode === "signup"
                    ? "Create account"
                    : "Sign in"}
            </button>

            <div className="auth-links">
              {mode === "signin" && (
                <>
                  <span>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setError("");
                      }}
                    >
                      Sign up
                    </button>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("reset");
                      setError("");
                      setResetSent(false);
                    }}
                  >
                    Forgot password?
                  </button>
                </>
              )}
              {mode === "signup" && (
                <span>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError("");
                    }}
                  >
                    Sign in
                  </button>
                </span>
              )}
              {mode === "reset" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError("");
                    setResetSent(false);
                  }}
                >
                  Back to sign in
                </button>
              )}
            </div>
          </form>
        </section>
        </div>
      </div>
    </div>
  );
}
