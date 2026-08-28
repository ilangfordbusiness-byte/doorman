import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export const COVERS = [
  // --- Purples / Violets ---
  { id: "c1",  name: "Void Pulse",       style: { background: "linear-gradient(135deg, #0d0015 0%, #2d0057 50%, #6a00c8 100%)" } },
  { id: "c2",  name: "Neon Ultraviolet", style: { background: "linear-gradient(135deg, #1a0038 0%, #7b00ff 60%, #00fff7 100%)" } },
  { id: "c3",  name: "Dark Nebula",      style: { background: "linear-gradient(160deg, #0a0010 0%, #3d007a 40%, #c700ff 80%, #ff00aa 100%)" } },
  { id: "c4",  name: "Amethyst Storm",   style: { background: "linear-gradient(135deg, #1e0035 0%, #5500aa 50%, #aa55ff 100%)" } },
  { id: "c5",  name: "Holo Violet",      style: { background: "linear-gradient(120deg, #0f001a 0%, #4b0082 40%, #8b5cf6 70%, #e879f9 100%)" } },

  // --- Cyans / Teals ---
  { id: "c6",  name: "Cyber Teal",       style: { background: "linear-gradient(135deg, #001a1a 0%, #007070 50%, #00ffee 100%)" } },
  { id: "c7",  name: "Arctic Neon",      style: { background: "linear-gradient(135deg, #00061a 0%, #003366 50%, #00d4ff 100%)" } },
  { id: "c8",  name: "Matrix Rain",      style: { background: "linear-gradient(160deg, #000d00 0%, #003300 40%, #00ff44 80%, #00ffaa 100%)" } },
  { id: "c9",  name: "Glacier",          style: { background: "linear-gradient(135deg, #001520 0%, #005570 50%, #00e5ff 80%, #80ffee 100%)" } },
  { id: "c10", name: "Deep Ocean",       style: { background: "linear-gradient(135deg, #00001a 0%, #000d66 50%, #0066ff 80%, #00d4ff 100%)" } },

  // --- Pinks / Magentas ---
  { id: "c11", name: "Neon Pink",        style: { background: "linear-gradient(135deg, #1a0010 0%, #66003a 50%, #ff0077 100%)" } },
  { id: "c12", name: "Holographic Rose", style: { background: "linear-gradient(120deg, #0d0010 0%, #550033 40%, #ff1493 70%, #ff77cc 100%)" } },
  { id: "c13", name: "Plasma Magenta",   style: { background: "linear-gradient(135deg, #100020 0%, #660066 50%, #ff00ff 100%)" } },
  { id: "c14", name: "Flamingo Flux",    style: { background: "linear-gradient(150deg, #1a0015 0%, #7a003d 50%, #ff6eb4 80%, #ffd1ec 100%)" } },
  { id: "c15", name: "Stardust Pink",    style: { background: "linear-gradient(135deg, #0d000d 0%, #4d004d 40%, #cc00cc 70%, #ff88ff 100%)" } },

  // --- Oranges / Ambers ---
  { id: "c16", name: "Solar Flare",      style: { background: "linear-gradient(135deg, #1a0500 0%, #7a2200 50%, #ff6600 80%, #ffaa00 100%)" } },
  { id: "c17", name: "Ember Core",       style: { background: "linear-gradient(135deg, #0d0200 0%, #550f00 50%, #ff3300 100%)" } },
  { id: "c18", name: "Lava Pulse",       style: { background: "linear-gradient(160deg, #0a0000 0%, #660000 40%, #ff2200 70%, #ffaa00 100%)" } },
  { id: "c19", name: "Golden Reactor",   style: { background: "linear-gradient(135deg, #0d0800 0%, #5c3a00 50%, #ffaa00 80%, #ffe066 100%)" } },
  { id: "c20", name: "Neon Amber",       style: { background: "linear-gradient(135deg, #110900 0%, #7a4400 50%, #ff8800 80%, #ffcc44 100%)" } },

  // --- Blues / Indigos ---
  { id: "c21", name: "Midnight Circuit", style: { background: "linear-gradient(135deg, #00001a 0%, #000066 50%, #0000ff 80%, #4488ff 100%)" } },
  { id: "c22", name: "Cobalt Aura",      style: { background: "linear-gradient(135deg, #00000d 0%, #00004d 50%, #003399 80%, #55aaff 100%)" } },
  { id: "c23", name: "Sapphire Grid",    style: { background: "linear-gradient(135deg, #000d1a 0%, #001f4d 50%, #0055cc 80%, #00aaff 100%)" } },
  { id: "c24", name: "Quantum Blue",     style: { background: "linear-gradient(160deg, #000510 0%, #000d33 40%, #001a6e 70%, #0066ff 100%)" } },
  { id: "c25", name: "Ion Storm",        style: { background: "linear-gradient(135deg, #00050d 0%, #002244 50%, #0077cc 80%, #33ccff 100%)" } },

  // --- Multi-color / Chromatic ---
  { id: "c26", name: "Aurora Borealis",  style: { background: "linear-gradient(135deg, #001a0d 0%, #003d1a 25%, #006699 50%, #4400aa 75%, #880077 100%)" } },
  { id: "c27", name: "Holochrome",       style: { background: "linear-gradient(135deg, #0d001a 0%, #007777 33%, #aa00ff 66%, #ff0055 100%)" } },
  { id: "c28", name: "Prismatic",        style: { background: "linear-gradient(120deg, #001a33 0%, #0044aa 25%, #7700cc 50%, #cc0066 75%, #ff4400 100%)" } },
  { id: "c29", name: "Spectrum Burst",   style: { background: "linear-gradient(135deg, #000d1a 0%, #006699 25%, #00cc88 50%, #ffcc00 75%, #ff3300 100%)" } },
  { id: "c30", name: "Synthwave",        style: { background: "linear-gradient(180deg, #0d0033 0%, #330066 40%, #cc0066 70%, #ff6600 100%)" } },

  // --- Greens / Emeralds ---
  { id: "c31", name: "Toxic Glow",       style: { background: "linear-gradient(135deg, #000d00 0%, #003300 50%, #00cc44 80%, #66ff33 100%)" } },
  { id: "c32", name: "Emerald Cipher",   style: { background: "linear-gradient(135deg, #000d08 0%, #003322 50%, #00aa66 80%, #00ffaa 100%)" } },
  { id: "c33", name: "Bio Hazard",       style: { background: "linear-gradient(160deg, #010800 0%, #0a2200 40%, #33ff00 80%, #aaff44 100%)" } },
  { id: "c34", name: "Malachite",        style: { background: "linear-gradient(135deg, #00100a 0%, #005533 50%, #00cc88 80%, #44ffcc 100%)" } },
  { id: "c35", name: "Forest Protocol",  style: { background: "linear-gradient(135deg, #00080a 0%, #003322 50%, #009966 80%, #00ff88 100%)" } },

  // --- Dark Mono / Gunmetal ---
  { id: "c36", name: "Obsidian",         style: { background: "linear-gradient(135deg, #000000 0%, #111111 50%, #333333 100%)" } },
  { id: "c37", name: "Phantom Grey",     style: { background: "linear-gradient(135deg, #05050a 0%, #1a1a2e 50%, #444466 100%)" } },
  { id: "c38", name: "Carbon Steel",     style: { background: "linear-gradient(135deg, #080808 0%, #1c1c1c 50%, #3a3a3a 80%, #666666 100%)" } },
  { id: "c39", name: "Midnight Slate",   style: { background: "linear-gradient(135deg, #050510 0%, #0f0f22 50%, #2a2a55 100%)" } },
  { id: "c40", name: "Deep Void",        style: { background: "linear-gradient(160deg, #000000 0%, #050510 50%, #0d0d33 100%)" } },

  // --- Special / Unique ---
  { id: "c41", name: "Crimson Override", style: { background: "linear-gradient(135deg, #0d0000 0%, #550000 50%, #cc0000 80%, #ff4444 100%)" } },
  { id: "c42", name: "Sunset Neon",      style: { background: "linear-gradient(135deg, #1a0010 0%, #880044 33%, #ff4400 66%, #ffaa00 100%)" } },
  { id: "c43", name: "Vaporwave",        style: { background: "linear-gradient(135deg, #1a0033 0%, #660099 33%, #ff0099 66%, #ffaa66 100%)" } },
  { id: "c44", name: "Outrun",           style: { background: "linear-gradient(180deg, #0d001a 0%, #55007a 30%, #aa0055 60%, #ff6600 90%, #ffcc00 100%)" } },
  { id: "c45", name: "Stealth Mode",     style: { background: "linear-gradient(135deg, #000000 0%, #0a0a1a 40%, #001133 70%, #003366 100%)" } },
  { id: "c46", name: "Hyperdrive",       style: { background: "linear-gradient(160deg, #000033 0%, #000099 30%, #0033ff 60%, #00aaff 80%, #ffffff 100%)" } },
  { id: "c47", name: "Nano Chrome",      style: { background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a3a 40%, #3300ff 70%, #00ffff 100%)" } },
  { id: "c48", name: "Infrared",         style: { background: "linear-gradient(135deg, #0d0000 0%, #440000 40%, #cc0033 70%, #ff00aa 100%)" } },
  { id: "c49", name: "Warp Core",        style: { background: "linear-gradient(135deg, #00001a 0%, #003399 33%, #00ccff 66%, #ffffff 100%)" } },
  { id: "c50", name: "Eclipse Protocol", style: { background: "linear-gradient(135deg, #000000 0%, #220033 33%, #660099 66%, #ff00ff 90%, #ffaaff 100%)" } },
];

export default function CoverPicker({ value, onChange, title }) {
  const [open, setOpen] = useState(false);
  const selected = COVERS.find((c) => c.id === value);

  return (
    <div className="space-y-3">
      {/* Preview */}
      <div
        className="relative h-44 rounded-2xl overflow-hidden border border-border flex items-end"
        style={selected ? selected.style : { background: "hsl(240 15% 5%)" }}
      >
        {/* Scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.06]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 3px)",
          }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Gradient fade bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {title ? (
          <p className="relative z-10 font-heading font-bold text-2xl text-white px-5 pb-4 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]"
            style={{ textShadow: "0 0 30px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,1)" }}>
            {title}
          </p>
        ) : (
          <p className="relative z-10 text-sm text-white/40 px-5 pb-4 font-mono">Event name will appear here</p>
        )}

        {selected && (
          <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 border border-white/10">
            <span className="text-[10px] font-mono text-white/70">{selected.name}</span>
          </div>
        )}
      </div>

      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-secondary/50 border border-border hover:border-primary/40 transition-colors text-sm font-medium"
      >
        <span className="text-muted-foreground">{selected ? `Background: ${selected.name}` : "Choose a background style"}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {/* Grid */}
      {open && (
        <div className="grid grid-cols-5 gap-2 p-3 bg-secondary/30 rounded-2xl border border-border/50 max-h-72 overflow-y-auto">
          {COVERS.map((cover) => (
            <button
              key={cover.id}
              type="button"
              onClick={() => { onChange(cover.id); setOpen(false); }}
              className={`relative h-14 rounded-xl overflow-hidden border-2 transition-all ${
                value === cover.id ? "border-primary scale-105 shadow-[0_0_12px_hsl(270_90%_65%/0.6)]" : "border-transparent hover:border-white/20"
              }`}
              style={cover.style}
              title={cover.name}
            >
              <div
                className="absolute inset-0 opacity-[0.05]"
                style={{
                  backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,1) 0px, rgba(255,255,255,1) 1px, transparent 1px, transparent 3px)",
                }}
              />
              {value === cover.id && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}