import { useState, useEffect, useRef } from "react";
import { api } from "@/api/data";

const BATCH = 100; // the get_event_attendees RPC clamps limit to <= 100

// Loads every attendee of an event by paging the RPC in 100s. Used by the
// full "Who's Going" modal and by the inline search, which only needs the
// complete list once the user starts typing (pass `enabled` to defer).
export function useAllAttendees(eventId, goingCount, enabled = true) {
  const key = `${eventId}:${goingCount || 0}`;
  const [state, setState] = useState({ key: null, attendees: [], loading: false });
  const requested = useRef(null); // key of the fetch in flight or completed
  const loadedKey = useRef(null); // key whose full list is in state

  useEffect(() => {
    if (!enabled || requested.current === key) return;
    requested.current = key;
    let cancelled = false;
    setState({ key, attendees: [], loading: true });
    (async () => {
      const all = [];
      try {
        for (let offset = 0; ; offset += BATCH) {
          const res = await api.functions.invoke("getEventAttendees", { event_id: eventId, offset, limit: BATCH });
          const batch = res.data?.attendees || [];
          all.push(...batch);
          if (batch.length < BATCH) break;              // last page reached
          if (all.length >= (goingCount || 0)) break;   // safety bound
        }
      } catch { /* keep whatever loaded */ }
      if (!cancelled) { loadedKey.current = key; setState({ key, attendees: all, loading: false }); }
    })();
    return () => {
      cancelled = true;
      // An interrupted fetch may be retried; a completed one stays cached.
      if (requested.current === key && loadedKey.current !== key) requested.current = null;
    };
  }, [eventId, goingCount, enabled, key]);

  const current = state.key === key;
  return {
    attendees: current ? state.attendees : [],
    loading: enabled && (!current || state.loading),
  };
}
