import type { AutocompleteData, NS } from "@ns";
export async function main(ns: NS) {
  const target = ns.args[0] as string;
  if (!target) {
    ns.tprintf("needs servername as argument");
    return;
  }
  const seen = new Map<string, string[]>([["home", []]]);
  const to_scan = ["home"];
  let next, pathToNext;
  while ((next = to_scan.shift()) !== undefined && !seen.has(target)) {
    pathToNext = seen.get(next)!;
    for (const scanned of ns.scan(next)) {
      if (seen.has(scanned)) {
        continue;
      }
      seen.set(scanned, [...pathToNext, scanned]);
      to_scan.push(scanned);
    }
  }
  const pathToTarget = seen.get(target);
  if (!pathToTarget) {
    ns.tprintf("path not found");
    return;
  }
  ns.tprintf(
    "command string to run: %s; backdoor",
    pathToTarget.map((server) => `connect ${server}`).join("; "),
  );
}

export function autocomplete(data: AutocompleteData, args: string[]) {
  return data.servers;
}
