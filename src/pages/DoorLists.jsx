import { useState, useEffect, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, Upload, ListChecks, Trash2, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "../components/LoadingSpinner";
import HomeButton from "@/components/HomeButton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canUseDoorLists } from "@/lib/featureAccess";
import { parseGuestCsv, listNameFromFilename } from "@/lib/partifulCsv";

const IMPORT_CHUNK = 500;

// Standalone door lists imported from a Partiful guest CSV. Allow-listed
// accounts import and own lists; people they invite see the lists shared with
// them here. RLS enforces both — this page only shapes the UI.
export default function DoorLists() {
  const { toast } = useToast();
  const { data: meData, isLoading: meLoading } = useCurrentUser();
  const me = /** @type {any} */ (meData);
  const canCreate = canUseDoorLists(me);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null); // { name, guests, headerFound }
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!me) return;
    api.entities.DoorList.list("-created_date")
      .then(setLists)
      .catch(() => toast({ title: "Couldn't load your lists", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [me?.id]);

  if (meLoading || (me && loading)) return <LoadingSpinner fullScreen />;
  if (!canCreate && lists.length === 0) return <Navigate to="/" replace />;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { guests, headerFound } = parseGuestCsv(await file.text());
      if (!guests.length) {
        toast({ title: "No names found", description: "That file doesn't have any guest names in it.", variant: "destructive" });
        return;
      }
      setPreview({ name: listNameFromFilename(file.name), guests, headerFound });
    } catch {
      toast({ title: "Couldn't read that file", variant: "destructive" });
    }
  }

  async function insertChunked(rows) {
    const out = [];
    for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
      out.push(...await api.entities.DoorListGuest.bulkCreate(rows.slice(i, i + IMPORT_CHUNK)));
    }
    return out;
  }

  async function runImport() {
    if (busyRef.current || !preview) return;
    const name = preview.name.trim();
    if (!name) {
      toast({ title: "Give the list a name", variant: "destructive" });
      return;
    }
    busyRef.current = true;
    setImporting(true);
    /** @type {any} */
    let list = null;
    try {
      list = await api.entities.DoorList.create({ name, source: "partiful" });
      const hosts = await insertChunked(preview.guests.map((g) => ({ ...g, list_id: list.id })));
      // Each plus-one is its own row so it can be checked in on its own.
      const plusOnes = hosts.flatMap((h) => Array.from({ length: h.plus_ones || 0 }, (_, i) => ({
        list_id: list.id,
        name: `${h.name} +${i + 1}`,
        status: h.status,
        plus_one_of: h.id,
      })));
      if (plusOnes.length) await insertChunked(plusOnes);
      setLists((prev) => [list, ...prev]);
      setPreview(null);
      toast({
        title: `${hosts.length + plusOnes.length} people imported`,
        description: plusOnes.length ? `${hosts.length} guests + ${plusOnes.length} plus-ones` : name,
      });
    } catch (err) {
      // Don't leave a half-imported list behind.
      if (list) await api.entities.DoorList.delete(list.id).catch(() => {});
      toast({ title: "Import failed", description: err?.message, variant: "destructive" });
    } finally {
      busyRef.current = false;
      setImporting(false);
    }
  }

  async function removeList(list) {
    if (!window.confirm(`Delete "${list.name}"? This removes every guest and check-in on it, for everyone it's shared with.`)) return;
    try {
      await api.entities.DoorList.delete(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch {
      toast({ title: "Couldn't delete the list", variant: "destructive" });
    }
  }

  const plusOneTotal = preview ? preview.guests.reduce((s, g) => s + (g.plus_ones || 0), 0) : 0;
  const statusCounts = preview
    ? Object.entries(preview.guests.reduce((acc, g) => {
        const k = g.status || "No status";
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/profile">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading font-bold text-xl">Door lists</h1>
          <p className="text-xs text-muted-foreground">Search a guest list and check people in</p>
        </div>
        <HomeButton />
      </div>

      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />

      {canCreate && (preview ? (
        <div className="bg-card rounded-2xl border border-border p-4 mb-5 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">List name</p>
            <Input value={preview.name} onChange={(e) => setPreview((p) => ({ ...p, name: e.target.value }))}
              className="h-11 rounded-xl bg-secondary/50 border-border" />
          </div>
          {!preview.headerFound && (
            <div className="flex gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
              No &quot;Name&quot; column found, so the first column is used as the name. Check the names below look right.
            </div>
          )}
          <div>
            <p className="text-sm font-semibold mb-2">
              {preview.guests.length} guests{plusOneTotal > 0 && <span className="text-muted-foreground font-normal"> + {plusOneTotal} plus-ones</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {statusCounts.map(([status, n]) => (
                <span key={status} className="text-xs px-2.5 py-1 rounded-full bg-secondary border border-border">
                  {status} · {n}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-secondary/40 border border-border/50 divide-y divide-border/50 max-h-48 overflow-y-auto">
            {preview.guests.slice(0, 8).map((g, i) => (
              <div key={i} className="px-3 py-2 text-sm flex justify-between gap-2">
                <span className="truncate">{g.name}{g.plus_ones ? <span className="text-primary font-semibold"> +{g.plus_ones}</span> : null}</span>
                <span className="text-muted-foreground text-xs flex-shrink-0">{g.status || ""}</span>
              </div>
            ))}
            {preview.guests.length > 8 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">and {preview.guests.length - 8} more…</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11 rounded-xl" disabled={importing} onClick={() => setPreview(null)}>Cancel</Button>
            <Button className="flex-1 h-11 rounded-xl" disabled={importing} onClick={runImport}>
              {importing ? "Importing…" : `Import ${preview.guests.length + plusOneTotal} people`}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-full h-12 rounded-xl gap-2 mb-5" onClick={() => fileRef.current?.click()}>
          <Upload className="w-4 h-4" /> Import Partiful CSV
        </Button>
      ))}

      {lists.length === 0 ? (
        <div className="text-center py-10">
          <ListChecks className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-heading font-semibold">No lists yet</p>
          <p className="text-sm text-muted-foreground mt-1">In Partiful, export the guest list as CSV, then import it here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((l) => {
            const owned = l.owner_id === me?.id;
            return (
              <div key={l.id} className="flex items-center gap-2 bg-card rounded-2xl border border-border pr-2">
                <Link to={`/door-lists/${l.id}`} className="flex-1 min-w-0 flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {owned ? "Imported" : "Shared with you"} · {l.created_date ? new Date(l.created_date).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
                {owned && (
                  <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${l.name}`} onClick={() => removeList(l)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
