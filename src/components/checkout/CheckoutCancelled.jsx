import { Link } from "react-router-dom";
import { XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown when a guest abandons Stripe Checkout. Nothing was charged.
export default function CheckoutCancelled({ eventId }) {
  return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/15 border border-destructive/30 flex items-center justify-center mx-auto mb-4">
        <XCircle className="w-9 h-9 text-destructive" />
      </div>
      <h1 className="font-heading font-bold text-2xl mb-1">Payment cancelled</h1>
      <p className="text-sm text-muted-foreground mb-6">You weren't charged. You can try again whenever you're ready.</p>
      <div className="flex gap-2">
        <Link to={`/event/${eventId}/checkout`} className="flex-1">
          <Button className="w-full h-12 rounded-xl gap-2"><RefreshCw className="w-4 h-4" /> Try again</Button>
        </Link>
        <Link to={`/event/${eventId}`} className="flex-1">
          <Button variant="outline" className="w-full h-12 rounded-xl">Back to event</Button>
        </Link>
      </div>
    </div>
  );
}