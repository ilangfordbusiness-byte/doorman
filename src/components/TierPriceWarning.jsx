import { AlertTriangle } from "lucide-react";
import { currencySymbol } from "@/lib/money";
import { LOW_TIER_PRICE, isLowTierPrice } from "@/lib/tiers";

// Warns the host while they type a very low tier price. It does not block the
// tier: a price of 0 is a free tier and shows no warning.
export default function TierPriceWarning({ price, currency, className = "" }) {
  if (!isLowTierPrice(price)) return null;
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-400 ${className}`}>
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>
        This price is under {currencySymbol(currency)}{LOW_TIER_PRICE.toFixed(2)}. Card payments can fail at very low
        prices because Stripe has a minimum charge.
      </span>
    </div>
  );
}
