// "Add to Apple Wallet" badge. Follows the shape of Apple's black badge
// (black rounded rectangle, thin light-grey border, Wallet glyph, two-line
// label). It is drawn here, not Apple's official artwork file: swap in the
// badge SVG from Apple's Wallet marketing guidelines before wide release.
export default function AddToAppleWalletButton({ onClick, busy = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Add to Apple Wallet"
      className={`inline-flex items-center gap-2.5 h-12 pl-3 pr-4 rounded-[10px] bg-black text-white border border-[#a6a6a6] disabled:opacity-60 transition-opacity ${className}`}
    >
      <svg width="30" height="24" viewBox="0 0 30 24" aria-hidden="true">
        <rect x="1" y="1" width="28" height="22" rx="4" fill="#d9d9d9" />
        <rect x="1" y="3" width="28" height="7" rx="2" fill="#3eb8ea" />
        <rect x="1" y="7" width="28" height="7" rx="2" fill="#fdb931" />
        <rect x="1" y="11" width="28" height="7" rx="2" fill="#ff5f52" />
        <path d="M1 15h9a5 4 0 0 0 10 0h9v4a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4z" fill="#f2f2f2" />
      </svg>
      <span className="flex flex-col items-start leading-none text-left">
        <span className="text-[10px] font-medium tracking-wide">{busy ? "Preparing…" : "Add to"}</span>
        <span className="text-[17px] font-semibold tracking-tight mt-0.5">Apple Wallet</span>
      </span>
    </button>
  );
}
