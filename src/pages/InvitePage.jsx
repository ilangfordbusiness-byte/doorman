import { useState, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { api } from "@/api/data";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "../components/LoadingSpinner";

// An invite link resolves the (secret) invite code to its event, then hands off
// to the full event page — carrying the code as ?invite=<code> so a signed-out
// visitor can preview a private event (the code authorises the preview). This
// way invite links and public event links show the exact same event layout.
export default function InvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, eventId: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Goes through the anon-capable get_event_by_invite RPC; works logged out.
        const events = await api.entities.Event.filter({ invite_code: code });
        if (alive) setState({ loading: false, eventId: events[0]?.id || null });
      } catch {
        if (alive) setState({ loading: false, eventId: null });
      }
    })();
    return () => { alive = false; };
  }, [code]);

  if (state.loading) return <LoadingSpinner fullScreen />;

  if (state.eventId) {
    return <Navigate to={`/event/${state.eventId}?invite=${encodeURIComponent(code)}`} replace />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <Sparkles className="w-12 h-12 text-muted-foreground mb-4" />
      <h1 className="font-heading font-bold text-xl text-foreground">Invite Not Found</h1>
      <p className="text-sm text-muted-foreground mt-2">This invite link may have expired or is invalid.</p>
      <Button variant="outline" className="mt-6 rounded-full" onClick={() => navigate("/")}>
        Go Home
      </Button>
    </div>
  );
}
