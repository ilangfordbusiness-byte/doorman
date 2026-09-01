import { useState } from "react";
import { Eye, LogOut, Loader2 } from "lucide-react";
import { getImpersonation, exitImpersonation } from "@/lib/impersonation";

// Persistent bar shown while a super-admin is acting as another user. State
// lives in sessionStorage (see impersonation.js), so it survives reloads.
export default function ImpersonationBanner() {
  const info = getImpersonation();
  const [exiting, setExiting] = useState(false);
  if (!info) return null;

  return (
    <div
      className="sticky top-0 z-50 flex items-center gap-3 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 backdrop-blur-xl"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <Eye className="w-4 h-4 text-amber-400 shrink-0" />
      <p className="text-xs text-amber-200 flex-1 min-w-0 truncate">
        Viewing as <span className="font-semibold text-amber-100">{info.targetName}</span>
      </p>
      <button
        onClick={async () => { setExiting(true); try { await exitImpersonation(); } catch { setExiting(false); } }}
        disabled={exiting}
        className="flex items-center gap-1.5 text-xs font-semibold text-amber-100 bg-amber-500/20 hover:bg-amber-500/30 rounded-full px-3 py-1.5 transition-colors shrink-0"
      >
        {exiting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
        Exit
      </button>
    </div>
  );
}
