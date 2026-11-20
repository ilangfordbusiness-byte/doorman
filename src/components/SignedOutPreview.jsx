import { Lock } from "lucide-react";
import { api } from "@/api/data";
import Avatar from "@/components/Avatar";

// Shared pieces for the signed-out previews of shared links (/event/:id,
// /b/:id): the visitor sees the real page, with a DoorMan + Sign in top bar,
// locked teasers for members-only sections, and a sign-up bar pinned to the
// bottom. Signing in or up returns them to the page they were on.

const signIn = () => api.auth.redirectToLogin(window.location.href);

// Top-bar contents for a signed-out visitor: the DoorMan wordmark (home) and
// a Sign in pill. Sits over the page's banner/cover.
export function SignedOutTopBar({ extra = null }) {
  return (
    <>
      <a href="/" className="h-9 px-3 rounded-full bg-black/35 backdrop-blur-md border border-white/15 inline-flex items-center gap-1.5 text-xs font-semibold text-white">
        <img src="/logo.png" alt="" className="w-4 h-4" /> DoorMan
      </a>
      <div className="flex items-center gap-2">
        {extra}
        <button type="button" onClick={signIn}
          className="h-9 px-3.5 rounded-full bg-white/90 hover:bg-white text-black text-xs font-semibold transition-colors">
          Sign in
        </button>
      </div>
    </>
  );
}

// Members-only section shown blurred behind a lock card; tapping it signs up.
export function LockedTeaser({ title, subtitle = "Free with a DoorMan account", children, className = "" }) {
  return (
    <button type="button" onClick={signIn} aria-label={title} className={`relative block w-full text-left ${className}`}>
      <div aria-hidden="true" className="pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 backdrop-blur-md bg-background/40" />
      <div className="absolute inset-0 grid place-items-center px-8">
        <div className="rounded-2xl border border-white/15 bg-black/60 px-5 py-4 text-center">
          <Lock className="w-5 h-5 mx-auto text-white" />
          <p className="mt-2 font-heading font-semibold text-[15px] text-white">{title}</p>
          <p className="mt-0.5 text-xs text-white/60">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

// Sign-up bar pinned to the bottom of the screen. Pages using it add bottom
// padding (pb-28) so it never covers their last section.
export function SignupBar({ picture, name, title, subtitle = "Free account · takes a minute" }) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="max-w-lg mx-auto px-3 pt-6 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-gradient-to-t from-background via-background/95 to-transparent">
        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-card/95 backdrop-blur px-4 py-3 flex items-center gap-3 shadow-2xl shadow-black/60">
          {(picture || name) && <Avatar src={picture} name={name || "?"} size="w-9 h-9" textClass="text-xs" />}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold leading-tight truncate">{title}</p>
            <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
          </div>
          <button type="button" onClick={signIn}
            className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-[13px] font-semibold px-4 py-2 transition-colors flex-shrink-0">
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}
