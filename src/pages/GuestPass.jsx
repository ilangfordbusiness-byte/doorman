import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Calendar, Clock, MapPin, Shirt, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "../components/StatusBadge";
import LoadingSpinner from "../components/LoadingSpinner";
import moment from "moment";

export default function GuestPass() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [entry, setEntry] = useState(null);
  const [qrData, setQrData] = useState("");
  const [loading, setLoading] = useState(true);
  const [locationTracking, setLocationTracking] = useState(false);
  const [autoCheckedOut, setAutoCheckedOut] = useState(false);
  const intervalRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    loadPass();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [id]);

  async function loadPass() {
    const authed = await base44.auth.isAuthenticated();
    if (!authed) {
      base44.auth.redirectToLogin(window.location.href);
      return;
    }
    const me = await base44.auth.me();
    const events = await base44.entities.Event.filter({ id });
    if (!events.length) return navigate("/");
    setEvent(events[0]);

    const entries = await base44.entities.GuestlistEntry.filter({
      event_id: id,
      guest_email: me.email,
    });
    if (!entries.length) return navigate(`/event/${id}`);
    setEntry(entries[0]);

    if (["approved", "invited"].includes(entries[0].status)) {
      generateQR(entries[0]);
    }

    setLoading(false);

    // Start location watch if already checked in
    if (entries[0].status === "checked_in" && !entries[0].checked_out_at) {
      startLocationWatch(entries[0], events[0]);
    }
  }

  useEffect(() => {
    return () => stopLocationWatch();
  }, []);

  async function handleCheckOut(auto = false) {
    const now = new Date().toISOString();
    await base44.entities.GuestlistEntry.update(entry.id, { checked_out_at: now });
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

  function generateQR(entry) {
    const payload = JSON.stringify({
      eid: entry.event_id,
      gid: entry.id,
      sec: entry.qr_secret,
    });
    setQrData(btoa(payload));
  }

  if (loading) return <LoadingSpinner fullScreen />;

  if (!event || !entry) return null;

  const eventDate = moment(event.date);
  const isApproved = ["approved", "invited"].includes(entry.status);
  const isCheckedIn = entry.status === "checked_in";
  const isDenied = entry.status === "denied" || entry.status === "revoked";

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
        </div>
      </div>
    </div>
  );
}