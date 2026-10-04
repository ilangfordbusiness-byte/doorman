import { useState, useEffect, useRef } from "react";
import { api } from "@/api/data";
import { Disc3, Plus, X, ChevronUp, ChevronDown, Clock, Mail, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import Avatar from "./Avatar";

// Host editor for an event's DJ lineup. Optimistic client-array save (like
// CoHostsSection) via Event.update(id, { dj_lineup }). A DJ can be linked to a
// DoorMan account (search + pick → clickable profile) or a plain typed name.
export default function LineupSection({ event, onUpdated }) {
  const { toast } = useToast();
  const lineup = Array.isArray(event.dj_lineup) ? event.dj_lineup : [];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [setTime, setSetTime] = useState("");
  const [linked, setLinked] = useState(null); // { user_id, picture } when picked from search
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editIdx, setEditIdx] = useState(null); // lineup row being edited
  const [editFields, setEditFields] = useState({ name: "", email: "", set_time: "" });
  const boxRef = useRef(null);

  const q = name.trim();
  useEffect(() => {
    if (linked || q.length < 2) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const people = await api.auth.searchProfiles(q);
        if (!cancelled) setResults(people.slice(0, 5));
      } catch { if (!cancelled) setResults([]); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, linked]);

  async function save(next) {
    setSaving(true);
    try {
      await api.entities.Event.update(event.id, { dj_lineup: next });
      onUpdated?.();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  }

  async function add() {
    const nm = name.trim();
    if (!nm) return;
    const em = email.trim().toLowerCase();
    let link = linked; // picked from the name-search dropdown
    // If not already linked and an email was given, try to connect it to a
    // DoorMan account so the DJ's name becomes clickable to their profile.
    if (!link && em) {
      setSaving(true);
      try {
        const profile = await api.auth.getProfile(em);
        if (profile?.id) {
          link = { user_id: profile.id, picture: profile.profile_picture || "" };
        } else {
          toast({ title: "No DoorMan account for that email", description: `${nm} added by name only.` });
        }
      } catch { /* fall through to unlinked */ }
      setSaving(false);
    }
    const next = [...lineup, { user_id: link?.user_id || null, name: nm, picture: link?.picture || "", set_time: setTime.trim() }];
    setName(""); setEmail(""); setSetTime(""); setLinked(null); setResults([]);
    save(next);
  }

  function remove(i) { save(lineup.filter((_, idx) => idx !== i)); }

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= lineup.length) return;
    const next = [...lineup];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  }

  function pick(u) {
    setName(u.full_name || u.email);
    setLinked({ user_id: u.id, picture: u.profile_picture || "" });
    setResults([]);
  }

  function startEditRow(i) {
    const d = lineup[i];
    setEditIdx(i);
    setEditFields({ name: d.name || "", email: "", set_time: d.set_time || "" });
  }

  // Save an edited row. An entered email (re)links the DJ to that DoorMan
  // account; blank keeps the row's existing link.
  async function saveEditRow(i) {
    const d = lineup[i];
    const nm = editFields.name.trim() || d.name;
    const em = editFields.email.trim().toLowerCase();
    let user_id = d.user_id || null;
    let picture = d.picture || "";
    if (em) {
      setSaving(true);
      try {
        const profile = await api.auth.getProfile(em);
        if (profile?.id) { user_id = profile.id; picture = profile.profile_picture || ""; }
        else { toast({ title: "No DoorMan account for that email", description: "Link left unchanged." }); }
      } catch { /* keep existing link */ }
      setSaving(false);
    }
    const next = lineup.map((row, idx) =>
      idx === i ? { ...row, name: nm, set_time: editFields.set_time.trim(), user_id, picture } : row);
    setEditIdx(null);
    save(next);
  }

  return (
    <div>
      <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2">
        <Disc3 className="w-4 h-4 text-primary" /> DJ Lineup
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Add the DJs playing and their set times. Link a DoorMan account so their name opens their DJ profile, or just type a name.
      </p>

      {lineup.length > 0 && (
        <div className="space-y-2 mb-3">
          {lineup.map((d, i) => (
            editIdx === i ? (
              <div key={d.id || i} className="bg-secondary/50 rounded-xl px-3 py-2.5 border border-border/50 space-y-2">
                <input
                  value={editFields.name}
                  onChange={(e) => setEditFields((s) => ({ ...s, name: e.target.value }))}
                  placeholder="DJ name"
                  className="w-full h-9 px-3 text-sm bg-secondary/60 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="email"
                    value={editFields.email}
                    onChange={(e) => setEditFields((s) => ({ ...s, email: e.target.value }))}
                    placeholder={d.user_id ? "Email to re-link (leave blank to keep)" : "Their DoorMan email — links their profile"}
                    className="w-full h-9 pl-8 pr-3 text-sm bg-secondary/60 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      value={editFields.set_time}
                      onChange={(e) => setEditFields((s) => ({ ...s, set_time: e.target.value }))}
                      placeholder="Set time"
                      className="w-full h-9 pl-8 pr-2 text-sm bg-secondary/60 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <Button size="sm" className="h-9 rounded-lg" onClick={() => saveEditRow(i)} disabled={saving || !editFields.name.trim()}><Check className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-9 rounded-lg" onClick={() => setEditIdx(null)} disabled={saving}><X className="w-4 h-4" /></Button>
                </div>
              </div>
            ) : (
            <div key={d.id || i} className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2 border border-border/50">
              <Avatar src={d.picture} name={d.name} size="w-8 h-8" textClass="text-xs" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {d.set_time || "No set time"}{d.user_id ? " · linked" : " · not linked"}
                </p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0 || saving} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" aria-label="Move up"><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => move(i, 1)} disabled={i === lineup.length - 1 || saving} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" aria-label="Move down"><ChevronDown className="w-4 h-4" /></button>
                <button onClick={() => startEditRow(i)} disabled={saving} className="text-muted-foreground hover:text-foreground p-1" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => remove(i)} disabled={saving} className="text-muted-foreground hover:text-destructive p-1" aria-label="Remove"><X className="w-4 h-4" /></button>
              </div>
            </div>
            )
          ))}
        </div>
      )}

      <div className="relative" ref={boxRef}>
        <div className="space-y-2">
          <div className="relative">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setLinked(null); }}
              placeholder="DJ name..."
              className="w-full h-10 px-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {results.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                {results.map((u) => (
                  <button key={u.email} onClick={() => pick(u)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/60 text-left">
                    <Avatar src={u.profile_picture} name={u.full_name || u.email} size="w-7 h-7" textClass="text-[10px]" />
                    <span className="text-sm truncate">{u.full_name || u.email}</span>
                    <span className="ml-auto text-[10px] text-primary">Link</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Their DoorMan email (optional) — links their profile"
              disabled={!!linked}
              className="w-full h-10 pl-8 pr-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={setTime}
                onChange={(e) => setSetTime(e.target.value)}
                placeholder="Set time"
                onKeyDown={(e) => e.key === "Enter" && add()}
                className="w-full h-10 pl-8 pr-2 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button size="sm" className="h-10 rounded-xl gap-1.5" onClick={add} disabled={saving || !name.trim()}>
              <Plus className="w-4 h-4" /> Add
            </Button>
          </div>
        </div>
        {linked
          ? <p className="text-[10px] text-primary mt-1">Will link to the selected DoorMan profile.</p>
          : email.trim() && <p className="text-[10px] text-muted-foreground mt-1">If this email has a DoorMan account, their profile will be linked.</p>}
      </div>
    </div>
  );
}
