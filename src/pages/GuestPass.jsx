import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, Shield, Send, ChevronLeft, ChevronRight, Clock as ClockIcon, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "../components/StatusBadge";
import LoadingSpinner from "../components/LoadingSpinner";
import TransferTicketDialog from "../components/TransferTicketDialog";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import moment from "moment";

const SYMBOL = { gbp: "£", eur: "€", usd: "$" };

export default function GuestPass() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entryIndex, setEntryIndex] = useState(0);
  const [entry, setEntry] = useState(null);
  const [qrData, setQrData] = useState("");
  const [loading, setLoading] = useState(true);
  const [locationTracking, setLocationTracking] = useState(false);
  const [autoCheckedOut, setAutoCheckedOut] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [pendingTransfer, setPendingTransfer] = useState(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { toast } = useToast();
  const intervalRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    loadPass();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id]);

  async function loadPass() {
    try {
      const authed = await api.auth.isAuthenticated();
      if (!authed) {
        api.auth.redirectToLogin(window.location.href);
        return;
      }
      const me = await api.auth.me();
      const events = await api.entities.Event.filter({ id });
      if (!events.length) return navigate("/");
      setEvent(events[0]);

      const allEntries = await api.entities.GuestlistEntry.filter({
        event_id: id,
        guest_email: me.email,
      });
      if (!allEntries.length) return navigate(`/event/${id}`);

      // Order: usable tickets (approved/invited) first, then the rest.
      const rank = (s) => (["approved", "invited"].includes(s) ? 0 : s === "checked_in" ? 1 : 2);
      allEntries.sort((a, b) => rank(a.status) - rank(b.status));

      setEntries(allEntries);
      setEntryIndex(0);
      setEntry(allEntries[0]);

      if (["approved", "invited"].includes(allEntries[0].status)) {
        generateQR(allEntries[0]);
      }

      loadPendingTransfer(allEntries[0].id);

      // Start location watch if already checked in
      if (allEntries[0].status === "checked_in" && !allEntries[0].checked_out_at) {
        startLocationWatch(allEntries[0], events[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingTransfer(entryId) {
    try {
      const t = await api.entities.TicketTransfer.filter({ guestlist_entry_id: entryId, status: "pending" });
      setPendingTransfer(t[0] || null);
    } catch {
      setPendingTransfer(null);
    }
  }

  function selectEntry(idx) {
    const e = entries[idx];
    if (!e) return;
    setEntryIndex(idx);
    setEntry(e);
    setQrData("");
    if (["approved", "invited"].includes(e.status)) generateQR(e);
    loadPendingTransfer(e.id);
    stopLocationWatch();
    if (e.status === "checked_in" && !e.checked_out_at) {
      startLocationWatch(e, event);
    }
  }

  useEffect(() => {
    return () => stopLocationWatch();
  }, []);

  async function handleCheckOut(auto = false) {
    const now = new Date().toISOString();
    await api.entities.GuestlistEntry.update(entry.id, { checked_out_at: now });
    setEntry((prev) => ({ ...prev, checked_out_at: now }));
    if (auto) setAutoCheckedOut(true);
    stopLocationWatch();
  }

  function stopLocationWatch() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setLocationTracking(false);
  }

  const startLocationWatch = useCallback((currentEntry, currentEvent) => {
    if (!currentEvent.venue_lat || !currentEvent.venue_lng) return;
    if (!navigator.geolocation) return;
    if (currentEntry.checked_out_at) return;

    setLocationTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const dist = getDistanceMeters(latitude, longitude, currentEvent.venue_lat, currentEvent.venue_lng);
        // Auto-checkout if more than 300m from venue
        if (dist > 300) {
          handleCheckOut(true);
        }
      },
      () => setLocationTracking(false),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 30000 }
    );
  }, []);

  function getDistanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function generateQR(entry) {
    // The QR secret never reaches the browser; the payload is minted
    // server-side for the ticket's owner.
    try {
      const res = await api.functions.invoke("myQrPayload", { entry_id: entry.id });
      setQrData(res.data || "");
    } catch (e) {
      console.error("Failed to generate QR payload:", e);
      setQrData("");
    }
  }

  async function refundTicket() {
    setCancelling(true);
    try {
      const res = await api.functions.invoke("refundTicket", { guestlist_entry_id: entry.id });
      if (res.data?.error) throw new Error(res.data.error);
      const sym = SYMBOL[String(event.currency || "gbp").toLowerCase()] || "";
      const amount = (Number(res.data?.refunded_minor || 0) / 100).toFixed(2);
      toast({ title: "Ticket cancelled", description: `${sym}${amount} is on its way back to your payment method.` });
      setShowCancel(false);
      await loadPass();
    } catch (e) {
      toast({ title: e.message || "Couldn't cancel this ticket", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  }

  async function cancelPendingTransfer() {
    if (!pendingTransfer) return;
    try {
      await api.entities.TicketTransfer.update(pendingTransfer.id, {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      });
      setPendingTransfer(null);
    } catch {}
  }

  if (loading) return <LoadingSpinner fullScreen />;

  if (!event || !entry) return (
    <div className="max-w-lg mx-auto px-4 pt-10 text-center">
      <p className="text-sm text-muted-foreground">Couldn't load this ticket.</p>
      <Button className="mt-4" onClick={() => navigate("/guest")}>My tickets</Button>
    </div>
  );

  const eventDate = moment(event.date);
  const isApproved = ["approved", "invited"].includes(entry.status);
  const isCheckedIn = entry.status === "checked_in";
  const isDenied = entry.status === "denied" || entry.status === "revoked";
  const hasMultiple = entries.length > 1;
  const ticketLabel = entry.notes || entry.guest_name || "Ticket";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate("/guest")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-heading font-bold text-lg">Your Pass</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        {/* Pass Card */}
        <div className="w-full max-w-sm bg-card rounded-3xl border border-border overflow-hidden shadow-2xl shadow-primary/5">
          {/* Top section */}
          <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-6 text-center border-b border-border/50">
            {hasMultiple && (
              <div className="flex items-center justify-center gap-3 mb-2">
                <button onClick={() => selectEntry(Math.max(0, entryIndex - 1))} disabled={entryIndex === 0} className="text-muted-foreground disabled:opacity-30 hover:text-foreground">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Ticket {entryIndex + 1} of {entries.length}</span>
                <button onClick={() => selectEntry(Math.min(entries.length - 1, entryIndex + 1))} disabled={entryIndex === entries.length - 1} className="text-muted-foreground disabled:opacity-30 hover:text-foreground">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <h2 className="font-heading font-bold text-xl text-foreground">{event.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{event.host_name}</p>
          </div>

          {/* QR Section */}
          <div className="p-6 flex flex-col items-center">
            {isApproved && qrData && (
              <>
                <div className="relative">
                  <div className="w-52 h-52 bg-white rounded-2xl p-3 flex items-center justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}&bgcolor=FFFFFF&color=000000`}
                      alt="QR Code"
                      className="w-full h-full"
                      key={qrData}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-5 text-xs text-muted-foreground">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Single-use code · Valid until first scan</span>
                </div>
              </>
            )}

            {isCheckedIn && (
            <div className="py-8 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">✓</span>
            </div>
            <p className="font-heading font-bold text-lg text-emerald-400">Checked In</p>
            <p className="text-sm text-muted-foreground mt-1">You're inside! Enjoy the event.</p>
            {autoCheckedOut ? (
              <p className="text-xs text-emerald-600 mt-3">Auto checked out when you left 👋</p>
            ) : !entry.checked_out_at ? (
              <>
                {locationTracking && (
                  <div className="flex items-center justify-center gap-1.5 mt-3">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[10px] text-muted-foreground">Auto-checkout active</span>
                  </div>
                )}
                {!locationTracking && event?.venue_lat && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 rounded-full text-xs text-muted-foreground"
                    onClick={() => startLocationWatch(entry, event)}
                  >
                    📍 Enable auto-checkout
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-full border-border text-muted-foreground"
                  onClick={() => handleCheckOut(false)}
                >
                  Leaving? Check Out
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-3">Checked out ✓</p>
            )}
            </div>
            )}

            {isDenied && (
              <div className="py-8 text-center">
                <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">✗</span>
                </div>
                <p className="font-heading font-bold text-lg text-destructive">Not Approved</p>
                <p className="text-sm text-muted-foreground mt-1">Your request was not approved.</p>
              </div>
            )}

            {entry.status === "requested" && (
              <div className="py-8 text-center">
                <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">⏳</span>
                </div>
                <p className="font-heading font-bold text-lg text-amber-400">Pending</p>
                <p className="text-sm text-muted-foreground mt-1">Waiting for host approval.</p>
              </div>
            )}
          </div>

          {/* Dashed separator */}
          <div className="relative px-4">
            <div className="border-t border-dashed border-border" />
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background" />
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background" />
          </div>

          {/* Details */}
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Guest</span>
              <span className="text-sm font-semibold text-foreground">{entry.guest_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <StatusBadge status={entry.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Date</span>
              <span className="text-sm text-foreground">{eventDate.format("ddd, MMM D")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Time</span>
              <span className="text-sm text-foreground">{event.start_time}</span>
            </div>
            {event.venue_name && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Venue</span>
                <span className="text-sm text-foreground">{event.venue_name}</span>
              </div>
            )}
            {event.dress_code && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Dress Code</span>
                <span className="text-sm text-foreground">{event.dress_code}</span>
              </div>
            )}
            {entry.plus_one && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Plus One</span>
                <span className="text-sm text-foreground">{entry.plus_one_name || "Yes"}</span>
              </div>
            )}
          </div>

          {/* Transfer section — only for usable, unscanned tickets */}
          {isApproved && (
            <div className="px-5 pb-5">
              {pendingTransfer ? (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold mb-1">
                    <ClockIcon className="w-3.5 h-3.5" /> Pending transfer
                  </div>
                  <p className="text-xs text-amber-200/80 mb-2">
                    Sent to {pendingTransfer.recipient_name || pendingTransfer.recipient_email} — waiting for them to accept. Your QR is still valid for entry.
                  </p>
                  <Button variant="outline" size="sm" className="w-full h-9 rounded-lg text-xs" onClick={cancelPendingTransfer}>
                    Cancel transfer
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full h-11 rounded-xl gap-2" onClick={() => setShowTransfer(true)}>
                  <Send className="w-4 h-4" /> Transfer ticket
                </Button>
              )}
              {hasMultiple && (
                <p className="text-[10px] text-muted-foreground text-center mt-2">Transferring: {ticketLabel}</p>
              )}
              {entry.order_id && !pendingTransfer && (
                <Button
                  variant="ghost"
                  className="w-full h-10 rounded-xl gap-2 mt-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowCancel(true)}
                >
                  <XCircle className="w-4 h-4" /> Cancel ticket &amp; get a refund
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showCancel} onOpenChange={setShowCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              Your ticket for {event.title} will be cancelled and its price refunded to the
              payment method you paid with (arrives within 5–10 business days). The QR code
              stops working immediately and this can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep ticket</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => { e.preventDefault(); refundTicket(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancel & refund"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showTransfer && (
        <TransferTicketDialog
          entry={entry}
          event={event}
          user={{ email: entry.guest_email }}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => loadPendingTransfer(entry.id)}
        />
      )}
    </div>
  );
}