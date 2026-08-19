import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from "base44:runtime";

// Edinburgh city centre — used to bias (not restrict) autocomplete suggestions
const EDINBURGH = "55.9533,-3.1883";
const BIAS_RADIUS = 50000; // 50km

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const key = secrets.get("GOOGLE_MAPS_API_KEY");
    if (!key) {
      console.log('placesAutocomplete: GOOGLE_MAPS_API_KEY not set');
      return Response.json({ error: 'Google Maps API key not configured' }, { status: 500 });
    }

    const body = await req.json();
    const action = body.action;

    if (action === "autocomplete") {
      const input = String(body.input || "").trim();
      if (input.length < 2) return Response.json({ suggestions: [] });
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${key}&location=${EDINBURGH}&radius=${BIAS_RADIUS}&language=en`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.log('placesAutocomplete error', data.status, data.error_message || '');
        return Response.json({ error: data.error_message || data.status }, { status: 502 });
      }
      const suggestions = (data.predictions || []).map((p) => ({
        place_id: p.place_id,
        description: p.description,
      }));
      return Response.json({ suggestions });
    }

    if (action === "details") {
      const placeId = String(body.place_id || "").trim();
      if (!placeId) return Response.json({ error: 'Missing place_id' }, { status: 400 });
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&key=${key}&fields=formatted_address,name,geometry&language=en`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== "OK") {
        console.log('placesAutocomplete details error', data.status, data.error_message || '');
        return Response.json({ error: data.error_message || data.status }, { status: 502 });
      }
      const r = data.result || {};
      return Response.json({
        formatted_address: r.formatted_address || "",
        name: r.name || "",
        lat: r.geometry?.location?.lat ?? null,
        lng: r.geometry?.location?.lng ?? null,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.log('placesAutocomplete error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}