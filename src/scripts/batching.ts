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
export async function prepare(ns: NS) {
  const startHandle = ns.getPortHandle(ports.batchCommandOffset + ns.pid);
  console.debug({
    message: "waiting for controller pid",
    port: ports.batchCommandOffset + ns.pid,
  });
  while (startHandle.empty()) {
    await startHandle.nextWrite();
  }
  const controllerPid = startHandle.read() as number;
  console.debug({ message: "read controller pid from port", controllerPid });
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
    startHandle.write(-delay);
    delay = 0;
  } else {
    startHandle.write(0);
  }
  return { target, delay, controllerPid };
}

export function autocomplete(data: AutocompleteData) {
  const flags = data.flags(flagSchema);
  if (Object.keys(flags).length == 0) {
    return flagSchema.map((name) => `--${name}`);
  }
  return [];
}
