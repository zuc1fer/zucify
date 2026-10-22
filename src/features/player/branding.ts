import type { AccentVariant } from "./store/playerStore";

export const BRANDING_ACCENTS: Record<AccentVariant, string> = {
  default: "var(--accent-primary)",
  spotify: "#1DB954",
  discord: "#5865F2",
  telegram: "#0088CC",
  aurora: "#a855f7",
  sunset: "#fb923c",
  ocean: "#2563eb",
  forest: "#059669",
  berry: "#db2777",
  carbon: "var(--text-primary)",
  pixel: "var(--text-primary)",
  scanlines: "var(--text-primary)",
  vhs: "#ff00ff",
};
