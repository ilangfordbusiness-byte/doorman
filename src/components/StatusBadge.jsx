const statusConfig = {
  invited: { label: "Invited", classes: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  requested: { label: "Requested", classes: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  approved: { label: "Approved", classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  denied: { label: "Denied", classes: "bg-red-500/15 text-red-400 border-red-500/20" },
  waitlist: { label: "Waitlist", classes: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  checked_in: { label: "Checked In", classes: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" },
  revoked: { label: "Revoked", classes: "bg-red-500/15 text-red-400 border-red-500/20" },
  draft: { label: "Draft", classes: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  published: { label: "Live", classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  cancelled: { label: "Cancelled", classes: "bg-red-500/15 text-red-400 border-red-500/20" },
  completed: { label: "Completed", classes: "bg-muted text-muted-foreground border-border" },
};

export default function StatusBadge({ status, size = "sm" }) {
  const config = statusConfig[status] || { label: status, classes: "bg-muted text-muted-foreground border-border" };
  const sizeClasses = size === "sm" ? "text-[10px] px-2.5 py-0.5" : "text-xs px-3 py-1";

  return (
    <span className={`inline-flex items-center font-semibold uppercase tracking-wider rounded-full border ${config.classes} ${sizeClasses}`}>
      {config.label}
    </span>
  );
}