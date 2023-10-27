import { AutocompleteData, NS } from "@ns";
import { ports } from "/scripts/constants";

export const scripts = {
  hack: "scripts/hack.js",
  grow: "scripts/grow.js",
  weaken: "scripts/weaken.js",
} as const;

export type FlagSchema = Parameters<AutocompleteData["flags"]>[0];
export const flagSchema: FlagSchema = [
  ["runFor", 0],
  ["endAt", 0],
  ["target", ""],
];

// this might need to be inlined for optimal performance some day
export function prepare(ns: NS) {
  const flags = ns.flags(flagSchema);
  const target = flags.target as string;
  const runFor = flags.runFor as number;
  const endAt = flags.endAt as number;
  let delay = endAt - runFor - performance.now();
  if (delay < 0) {
    console.debug({
      message:
        "batch member took too long to start, will delay following batches",
      runFor,
      endAt,
      actualDelay: delay,
    });
    ns.writePort(ports.batchCommandOffset + ns.pid, -delay);
    delay = 0;
  } else {
    ns.writePort(ports.batchCommandOffset + ns.pid, 0);
  }
  return { target, delay };
}

export function autocomplete(data: AutocompleteData) {
  const flags = data.flags(flagSchema);
  if (Object.keys(flags).length == 0) {
    return flagSchema.map((name) => `--${name}`);
  }
  return [];
}
