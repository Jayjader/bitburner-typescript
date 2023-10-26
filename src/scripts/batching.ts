import { AutocompleteData } from "@ns";

export const scripts = {
  hack: "scripts/hack.js",
  grow: "scripts/grow.js",
  weaken: "scripts/weaken.js",
} as const;

export const timings = (h: number, g: number, w: number, d: number) => [
  0,
  2 * d,
  w - g + d,
  w - 3 * d - h,
  w - 3 * d,
  w + d,
];
export type FlagSchema = Parameters<AutocompleteData["flags"]>[0];
export const flagSchema: FlagSchema = [
  ["delay", 100],
  ["target", ""],
];

export function autocomplete(data: AutocompleteData) {
  const flags = data.flags(flagSchema);
  if (Object.keys(flags).length == 0) {
    return flagSchema.map((name) => `--${name}`);
  }
  return [];
}
