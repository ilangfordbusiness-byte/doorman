import { AlertTriangle } from "lucide-react";
import { tierPriceProblem } from "@/lib/fees";
import { formatMoney } from "@/lib/money";

const REASON = {
  fee_larger: "the booking fee would be larger than the ticket price",
  fee_equal: "the booking fee would be the same as the ticket price",
  stripe_minimum: "the charge would be under Stripe's minimum",
};

// Warns the host when a tier price can't be bought at checkout, given the
// event's fee mode and currency. Empty and 0 show nothing.
export default function TierPriceWarning({ price, currency, feeMode, className = "" }) {
  const problem = tierPriceProblem(price, feeMode, currency);
  if (!problem) return null;
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-400 ${className}`}>
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>
        The minimum price is {formatMoney(problem.minMinor, currency)}. This ticket can't be bought below that: {REASON[problem.reason]}.
      </span>
    </div>
  );
}
