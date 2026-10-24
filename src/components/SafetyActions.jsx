import { useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/data";
import { Flag, Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const REASONS = [
  ["spam", "Spam"],
  ["harassment", "Harassment or bullying"],
  ["hate", "Hate speech"],
  ["sexual", "Sexual content"],
  ["violence", "Violence or threats"],
  ["scam", "Scam or fraud"],
  ["other", "Something else"],
];

// Report and Block controls for content other users wrote (App Store
// Guideline 1.2). `target` is what is reported: { type: "event", event_id },
// { type: "message", message_id } or { type: "user", user_id }. `userId` is
// the person to block; omit it to show only Report.
export default function SafetyActions({ target, userId, userName, onBlocked, compact = false, className = "" }) {
  const [open, setOpen] = useState(null); // "report" | "block" | null
  const label = target.type === "event" ? "event" : target.type === "message" ? "message" : "user";
  return (
    <>
      <div className={`flex items-center justify-center gap-4 ${className}`}>
        <button
          type="button"
          onClick={() => setOpen("report")}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Flag className="w-3.5 h-3.5" />
          {compact ? "Report" : `Report ${label}`}
        </button>
        {userId && (
          <button
            type="button"
            onClick={() => setOpen("block")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <Ban className="w-3.5 h-3.5" />
            {compact ? "Block" : `Block ${userName || "user"}`}
          </button>
        )}
      </div>
      {open === "report" && <ReportSheet target={target} label={label} onClose={() => setOpen(null)} />}
      {open === "block" && (
        <BlockSheet userId={userId} userName={userName} onClose={() => setOpen(null)} onBlocked={onBlocked} />
      )}
    </>
  );
}

// Portalled to <body>: the event page wraps its content in a stacking context,
// so a fixed overlay rendered in place can sit under later page elements.
function Sheet({ title, onClose, children }) {
  return createPortal(
    <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border p-5 w-full max-w-sm relative text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
        <h3 className="font-heading font-semibold text-base pr-8 mb-3">{title}</h3>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ReportSheet({ target, label, onClose }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!reason || sending) return;
    setSending(true);
    try {
      await api.safety.report(target, reason, details);
      toast({ title: "Report sent", description: "Thanks. Our team reviews every report within 24 hours." });
      onClose();
    } catch (e) {
      toast({ title: "Could not send report", description: e.message, variant: "destructive" });
      setSending(false);
    }
  }

  return (
    <Sheet title={`Report this ${label}`} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">Why are you reporting it?</p>
      <div className="space-y-1.5 mb-3">
        {REASONS.map(([value, text]) => (
          <label
            key={value}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer ${
              reason === value ? "border-primary bg-primary/10" : "border-border"
            }`}
          >
            <input
              type="radio"
              name="report-reason"
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              className="accent-primary"
            />
            {text}
          </label>
        ))}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
        placeholder="Add details (optional)"
        rows={3}
        className="w-full px-3 py-2 text-base bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring mb-3"
      />
      <Button className="w-full" disabled={!reason || sending} onClick={submit}>
        {sending ? "Sending..." : "Send report"}
      </Button>
    </Sheet>
  );
}

function BlockSheet({ userId, userName, onClose, onBlocked }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await api.safety.block(userId);
      queryClient.invalidateQueries();
      toast({ title: `${userName || "User"} blocked`, description: "You can unblock them from your profile." });
      onClose();
      onBlocked?.();
    } catch (e) {
      toast({ title: "Could not block", description: e.message, variant: "destructive" });
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Block ${userName || "this user"}?`} onClose={onClose}>
      <p className="text-sm text-muted-foreground mb-4">
        You will no longer see their events, messages or profile, and neither of you can send the
        other a friend request. Any friendship between you ends. They are not told.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="destructive" className="flex-1" onClick={confirm} disabled={busy}>
          {busy ? "Blocking..." : "Block"}
        </Button>
      </div>
    </Sheet>
  );
}
