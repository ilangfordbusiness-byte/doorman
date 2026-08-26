import { useState } from "react";
import { api } from "@/api/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Mail } from "lucide-react";

// Sign-in screen, rendered by the app shell whenever there is no session.
// Not a route — views are local state: root (Google + manual entry point),
// signin, signup, check-email (confirmation pending), forgot, forgot-sent.
export default function Login() {
  const [view, setView] = useState("root");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  async function withBusy(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message || "Something went wrong");
      setBusy(false);
    }
  }

  function go(next) {
    setView(next);
    setError("");
    setNotice("");
    setBusy(false);
  }

  const inputCls = "h-12 rounded-xl bg-secondary/50 border-border";

  function header(title, subtitle) {
    return (
      <>
        <button
          type="button"
          onClick={() => go(view === "signup" || view === "forgot" ? "signin" : "root")}
          className="absolute left-0 top-0 p-2 text-muted-foreground hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-extrabold mb-1">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>
      </>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <div className="relative w-full max-w-sm text-center">
        {view === "root" && (
          <>
            <img src="/logo.png" alt="DoorMan" className="w-16 h-16 mx-auto mb-6 object-contain" />
            <h1 className="text-2xl font-extrabold mb-1">DoorMan</h1>
            <p className="text-sm text-muted-foreground mb-8">
              Guestlists, tickets and the door — in one place.
            </p>
            <Button
              disabled={busy}
              onClick={() => withBusy(() => api.auth.signInWithGoogle(window.location.href))}
              variant="outline"
              className="w-full h-12 rounded-xl font-semibold gap-3"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              Continue with Google
            </Button>
            <Button
              disabled={busy}
              onClick={() => go("signin")}
              variant="outline"
              className="w-full h-12 rounded-xl font-semibold gap-3 mt-3"
            >
              <Mail className="w-4 h-4" />
              Sign in with email
            </Button>
          </>
        )}

        {view === "signin" && (
          <>
            {header("Sign in", "Welcome back — use your email and password.")}
            <form
              className="space-y-3 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                withBusy(() => api.auth.signInWithPassword(email, password));
              }}
            >
              <Input className={inputCls} type="email" placeholder="Email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input className={inputCls} type="password" placeholder="Password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Button disabled={busy} className="w-full h-12 rounded-xl font-semibold">
                Sign in
              </Button>
            </form>
            <button type="button" onClick={() => go("forgot")}
              className="mt-4 text-sm text-muted-foreground hover:text-foreground">
              Forgot password?
            </button>
            <p className="mt-6 text-sm text-muted-foreground">
              New here?{" "}
              <button type="button" onClick={() => go("signup")} className="font-semibold text-primary">
                Create an account
              </button>
            </p>
          </>
        )}

        {view === "signup" && (
          <>
            {header("Create an account", "Your name is what hosts see on the guestlist.")}
            <form
              className="space-y-3 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                withBusy(async () => {
                  const { needsConfirmation } = await api.auth.signUp(
                    email, password, `${firstName.trim()} ${lastName.trim()}`.trim(),
                  );
                  if (needsConfirmation) go("check-email");
                  // else: session arrived; AuthContext unmounts this screen.
                });
              }}
            >
              <div className="flex gap-3">
                <Input className={inputCls} placeholder="First name" autoComplete="given-name"
                  value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                <Input className={inputCls} placeholder="Last name" autoComplete="family-name"
                  value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <Input className={inputCls} type="email" placeholder="Email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input className={inputCls} type="password" placeholder="Password (min 6 characters)"
                autoComplete="new-password" minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Button disabled={busy} className="w-full h-12 rounded-xl font-semibold">
                Create account
              </Button>
            </form>
            <p className="mt-6 text-sm text-muted-foreground">
              Already have an account?{" "}
              <button type="button" onClick={() => go("signin")} className="font-semibold text-primary">
                Sign in
              </button>
            </p>
          </>
        )}

        {view === "check-email" && (
          <>
            <Mail className="w-10 h-10 mx-auto mb-4 text-primary" />
            <h1 className="text-xl font-extrabold mb-1">Check your email</h1>
            <p className="text-sm text-muted-foreground mb-6">
              We sent a confirmation link to <span className="font-semibold text-foreground">{email}</span>.
              Open it to finish creating your account.
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                withBusy(async () => {
                  await api.auth.resendConfirmation(email);
                  setNotice("Confirmation email re-sent.");
                  setBusy(false);
                })
              }
              className="w-full h-12 rounded-xl font-semibold"
            >
              Resend email
            </Button>
            <button type="button" onClick={() => go("signin")}
              className="mt-4 text-sm text-muted-foreground hover:text-foreground">
              Back to sign in
            </button>
          </>
        )}

        {view === "forgot" && (
          <>
            {header("Reset password", "We'll email you a link to set a new one.")}
            <form
              className="space-y-3 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                withBusy(async () => {
                  await api.auth.resetPassword(email);
                  go("forgot-sent");
                });
              }}
            >
              <Input className={inputCls} type="email" placeholder="Email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Button disabled={busy} className="w-full h-12 rounded-xl font-semibold">
                Send reset link
              </Button>
            </form>
          </>
        )}

        {view === "forgot-sent" && (
          <>
            <Mail className="w-10 h-10 mx-auto mb-4 text-primary" />
            <h1 className="text-xl font-extrabold mb-1">Check your email</h1>
            <p className="text-sm text-muted-foreground mb-6">
              If an account exists for <span className="font-semibold text-foreground">{email}</span>,
              a password reset link is on its way.
            </p>
            <button type="button" onClick={() => go("signin")}
              className="text-sm text-muted-foreground hover:text-foreground">
              Back to sign in
            </button>
          </>
        )}

        {notice && <p className="mt-4 text-sm text-emerald-400">{notice}</p>}
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <p className="mt-10 text-xs text-muted-foreground/70">
          <a href="/privacy" className="hover:text-foreground underline underline-offset-2">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
