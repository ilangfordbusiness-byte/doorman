// Host-selectable looks for the DJ lineup names. Shared by the host picker
// (LineupSection) and the event page (EventDetails) so they stay in sync. Each
// preset is a Tailwind className + optional inline style (for glows/gradients
// that aren't expressible as classes). All are used with FitText, so they fill
// the row width regardless of treatment.
export const LINEUP_STYLES = [
  {
    id: "neon_cyan",
    label: "Neon Cyan",
    className: "font-mono uppercase font-bold text-cyan-100",
    style: { textShadow: "0 0 6px hsl(180 100% 50% / 0.75), 0 0 16px hsl(180 100% 50% / 0.45)" },
  },
  {
    id: "neon_purple",
    label: "Neon Purple",
    className: "font-mono uppercase font-bold text-purple-200",
    style: { textShadow: "0 0 6px hsl(270 90% 65% / 0.8), 0 0 16px hsl(270 90% 65% / 0.5)" },
  },
  {
    id: "gradient",
    label: "Gradient",
    className: "font-mono uppercase font-black bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent",
    style: {},
  },
  {
    id: "minimal",
    label: "Minimal",
    className: "font-heading font-bold text-foreground",
    style: {},
  },
];

export const DEFAULT_LINEUP_STYLE = "neon_cyan";

export function lineupStyle(id) {
  return LINEUP_STYLES.find((s) => s.id === id) || LINEUP_STYLES[0];
}
